-- =====================================================================
-- AKWEO : espace super admin
--   A. Moyens de paiement des ABONNEMENTS gérés sans code
--      (MTN MoMo, FedaPay pour MTN / Moov / Celtiis / autres pays / cartes,
--      Kkiapay). Clés chiffrées, jamais lisibles par le navigateur.
--   B. Suppression des comptes d'entreprises inactifs (avec journal).
-- À exécuter APRÈS migration_paiements_vente.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- A1. MOYENS DE PAIEMENT DE LA PLATEFORME
-- ---------------------------------------------------------------------
create table if not exists moyens_paiement_abonnement (
    id             uuid primary key default gen_random_uuid(),
    fournisseur    text not null check (fournisseur in ('fedapay', 'mtn_momo', 'kkiapay')),
    libelle        text not null default '',
    environnement  text not null default 'test' check (environnement in ('test', 'production')),
    -- mtn / moov / celtiis = demande envoyée sur le téléphone ;
    -- international = page de paiement FedaPay (autres pays de la zone, cartes bancaires) ;
    -- widget = fenêtre Kkiapay (MTN, Moov, carte).
    operateurs     text[] not null default '{}',
    cle_publique   text,                 -- Kkiapay uniquement (clé publique, non secrète)
    actif          boolean not null default true,
    ordre          integer not null default 0,
    apercu_cle     text,
    verifie_le     timestamptz,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    constraint moyens_paiement_abonnement_operateurs check (
        cardinality(operateurs) >= 1
        and operateurs <@ array['mtn', 'moov', 'celtiis', 'international', 'widget']::text[]
    )
);

create table if not exists moyens_paiement_abonnement_secrets (
    moyen_id       uuid primary key references moyens_paiement_abonnement(id) on delete cascade,
    cles_chiffrees text not null,
    updated_at     timestamptz not null default now()
);

alter table moyens_paiement_abonnement enable row level security;
alter table moyens_paiement_abonnement_secrets enable row level security;

-- Lecture des moyens (sans clé secrète) par tout utilisateur connecté :
-- la page de paiement de l'abonnement les affiche. Écriture : Edge Function
-- admin-moyens-paiement (service role) uniquement.
drop policy if exists "lecture_moyens_paiement_abonnement" on moyens_paiement_abonnement;
create policy "lecture_moyens_paiement_abonnement" on moyens_paiement_abonnement
    for select to authenticated using (actif or est_super_admin());
revoke insert, update, delete on moyens_paiement_abonnement from anon, authenticated;
revoke all on moyens_paiement_abonnement_secrets from anon, authenticated;

-- ---------------------------------------------------------------------
-- A2. PAIEMENTS D'ABONNEMENT : nouveaux fournisseurs
-- ---------------------------------------------------------------------
alter table paiements_abonnement drop constraint if exists paiements_abonnement_fournisseur_check;
alter table paiements_abonnement add constraint paiements_abonnement_fournisseur_check
    check (fournisseur in ('mtn_momo', 'kkiapay', 'fedapay'));
alter table paiements_abonnement add column if not exists moyen_id uuid
    references moyens_paiement_abonnement(id) on delete set null;
alter table paiements_abonnement add column if not exists operateur text;

-- ---------------------------------------------------------------------
-- B1. JOURNAL DES SUPPRESSIONS
-- ---------------------------------------------------------------------
create table if not exists journal_suppressions_entreprises (
    id               uuid primary key default gen_random_uuid(),
    entreprise_id    uuid not null,
    nom              text not null,
    plan_abonnement  text,
    date_expiration  date,
    nb_utilisateurs  integer,
    nb_ventes        integer,
    supprime_par     uuid,              -- auth.users.id du super admin
    supprime_le      timestamptz not null default now()
);
alter table journal_suppressions_entreprises enable row level security;
drop policy if exists "lecture_journal_suppressions" on journal_suppressions_entreprises;
create policy "lecture_journal_suppressions" on journal_suppressions_entreprises
    for select to authenticated using (est_super_admin());
revoke insert, update, delete on journal_suppressions_entreprises from anon, authenticated;

-- ---------------------------------------------------------------------
-- B2. LISTE DES ENTREPRISES INACTIVES
--     Inactive = compte suspendu, OU abonnement (ou essai) expiré depuis
--     au moins p_jours jours. Dernière vente et dernière connexion
--     affichées pour décider en connaissance de cause.
-- ---------------------------------------------------------------------
create or replace function admin_entreprises_inactives(p_jours integer default 30)
returns table (
    id                  uuid,
    nom                 text,
    plan_abonnement     text,
    actif               boolean,
    date_expiration     date,
    jours_depuis_expiration integer,
    created_at          timestamptz,
    nb_utilisateurs     integer,
    nb_ventes           integer,
    derniere_vente      timestamptz,
    derniere_connexion  timestamptz,
    telephone           text,
    email               text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    perform exiger_super_admin();
    return query
    select e.id, e.nom, e.plan_abonnement, e.actif, e.date_expiration_abonnement,
           (current_date - e.date_expiration_abonnement)::integer,
           e.created_at,
           (select count(*)::integer from utilisateurs u where u.entreprise_id = e.id),
           (select count(*)::integer from ventes v where v.entreprise_id = e.id),
           (select max(v.created_at) from ventes v where v.entreprise_id = e.id),
           (select max(au.last_sign_in_at) from utilisateurs u join auth.users au on au.id = u.auth_user_id
             where u.entreprise_id = e.id),
           e.telephone, e.email
    from entreprises e
    where not e.actif
       or e.date_expiration_abonnement < current_date - greatest(coalesce(p_jours, 30), 0)
    order by e.date_expiration_abonnement nulls first, e.created_at;
end;
$$;

-- ---------------------------------------------------------------------
-- B3a. Vidage des données d'une entreprise (interne, sans droits publics)
-- ---------------------------------------------------------------------
create or replace function _vider_donnees_entreprise(p_entreprise_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_table   text;
    v_restant integer;
    v_passe   integer := 0;
    v_lignes  integer;
begin
    loop
        v_passe := v_passe + 1;
        v_restant := 0;
        for v_table in
            select c.table_name from information_schema.columns c
            join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
            where c.table_schema = 'public' and c.column_name = 'entreprise_id'
              and t.table_type = 'BASE TABLE'
              and c.table_name not in ('entreprises', 'journal_suppressions_entreprises')
        loop
            begin
                execute format('delete from %I where entreprise_id = $1', v_table) using p_entreprise_id;
            exception when foreign_key_violation or restrict_violation then
                null; -- encore référencée par une autre table : retentée à la passe suivante
            end;
            execute format('select count(*) from %I where entreprise_id = $1', v_table) into v_lignes using p_entreprise_id;
            v_restant := v_restant + v_lignes;
        end loop;
        exit when v_restant = 0;
        if v_passe >= 12 then
            raise exception 'Suppression impossible : des données restent liées (% lignes).', v_restant;
        end if;
    end loop;
end;
$$;
revoke all on function _vider_donnees_entreprise(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- B3. SUPPRESSION D'UNE ENTREPRISE INACTIVE
--     Garde-fous : super admin, entreprise réellement inactive (suspendue
--     ou expirée depuis 30 jours au moins), nom retapé à l'identique.
--     Renvoie les comptes de connexion à effacer ensuite (Edge Function).
-- ---------------------------------------------------------------------
create or replace function admin_supprimer_entreprise(p_entreprise_id uuid, p_nom_confirme text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_e     entreprises%rowtype;
    v_auth  uuid[];
    v_nb_u  integer;
    v_nb_v  integer;
begin
    perform exiger_super_admin();

    select * into v_e from entreprises where id = p_entreprise_id for update;
    if not found then
        raise exception 'Entreprise introuvable.';
    end if;
    if v_e.actif and coalesce(v_e.date_expiration_abonnement, current_date) >= current_date - 30 then
        raise exception 'Cette entreprise est encore active : suspends-la ou attends 30 jours après l''expiration.';
    end if;
    if btrim(coalesce(p_nom_confirme, '')) <> btrim(v_e.nom) then
        raise exception 'Le nom saisi ne correspond pas : suppression annulée.';
    end if;

    -- Comptes de connexion à effacer : ceux de l'entreprise, sauf un super
    -- admin ou un agent commercial (leur compte sert ailleurs).
    select coalesce(array_agg(u.auth_user_id), '{}') into v_auth
    from utilisateurs u
    where u.entreprise_id = p_entreprise_id
      and not exists (select 1 from super_admins s where s.auth_user_id = u.auth_user_id)
      and not exists (select 1 from agents_commerciaux a where a.auth_user_id = u.auth_user_id);

    select count(*) into v_nb_u from utilisateurs where entreprise_id = p_entreprise_id;
    select count(*) into v_nb_v from ventes where entreprise_id = p_entreprise_id;

    -- Les données sont vidées table par table : certaines liaisons internes
    -- (lignes de vente → articles, avoirs → ventes, commandes → fournisseurs…)
    -- interdisent un ordre quelconque. On répète donc les passes, chaque
    -- suppression bloquée étant retentée au tour suivant, jusqu'à ce que
    -- tout soit vide.
    perform _vider_donnees_entreprise(p_entreprise_id);

    insert into journal_suppressions_entreprises
        (entreprise_id, nom, plan_abonnement, date_expiration, nb_utilisateurs, nb_ventes, supprime_par)
    values (v_e.id, v_e.nom, v_e.plan_abonnement, v_e.date_expiration_abonnement, v_nb_u, v_nb_v, auth.uid());

    -- Tout le reste part en cascade (ventes, stock, clients, factures, tontines…).
    delete from entreprises where id = p_entreprise_id;

    return jsonb_build_object('nom', v_e.nom, 'auth_user_ids', to_jsonb(v_auth),
                              'nb_utilisateurs', v_nb_u, 'nb_ventes', v_nb_v);
end;
$$;

revoke all on function admin_entreprises_inactives(integer) from public, anon;
revoke all on function admin_supprimer_entreprise(uuid, text) from public, anon;
grant execute on function admin_entreprises_inactives(integer) to authenticated;
grant execute on function admin_supprimer_entreprise(uuid, text) to authenticated;
