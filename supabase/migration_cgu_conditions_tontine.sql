-- =====================================================================
-- MIGRATION : CGU AKWEO + CONDITIONS DE TONTINE DÉFINIES PAR LE GÉRANT
-- À exécuter après migration_tontine.sql et migration_permissions_individuelles.sql.
--
--   1. Trace de l'acceptation des CGU Akweo par le gérant (version +
--      horodatage serveur) sur l'entreprise.
--   2. Conditions de tontine propres à chaque entreprise, rédigées et
--      versionnées par le gérant (écriture uniquement via RPC).
--   3. Chaque nouvelle tontine exige l'acceptation des conditions par le
--      client ; le texte exact accepté est figé (snapshot) sur la tontine
--      et ne peut plus être modifié ensuite.
--   4. Durcissement des RPC tontine existantes : l'entreprise passée en
--      paramètre doit être celle de l'appelant (isolation multi-tenant),
--      verrouillage de ligne sur les cotisations (pas de course au cumul).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ACCEPTATION DES CGU AKWEO
-- ---------------------------------------------------------------------
alter table entreprises add column if not exists cgu_version      text;
alter table entreprises add column if not exists cgu_acceptees_le timestamptz;

create or replace function enregistrer_acceptation_cgu(p_version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role          text;
    v_entreprise_id uuid;
begin
    if p_version is null or length(p_version) = 0 or length(p_version) > 32 then
        raise exception 'Version des CGU invalide.';
    end if;

    select role, entreprise_id into v_role, v_entreprise_id
    from utilisateurs where auth_user_id = auth.uid();

    if v_role is distinct from 'gerant' then
        raise exception 'Seul le gérant peut accepter les CGU pour l''entreprise.';
    end if;

    -- L'horodatage vient du serveur, jamais du navigateur.
    update entreprises
        set cgu_version = p_version,
            cgu_acceptees_le = now()
        where id = v_entreprise_id;
end;
$$;

revoke all on function enregistrer_acceptation_cgu(text) from public, anon;
grant execute on function enregistrer_acceptation_cgu(text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. CONDITIONS DE TONTINE (une ligne par entreprise)
-- ---------------------------------------------------------------------
create table if not exists conditions_tontine (
    entreprise_id   uuid primary key references entreprises(id) on delete cascade,
    contenu         text not null check (char_length(contenu) between 50 and 10000),
    version         integer not null default 1,
    modifie_par     uuid references utilisateurs(id),
    updated_at      timestamptz not null default now()
);

alter table conditions_tontine enable row level security;

-- Lecture pour toute l'entreprise ; AUCUNE policy d'écriture : les
-- modifications passent exclusivement par la RPC ci-dessous (gérant).
drop policy if exists "lecture_conditions_tontine" on conditions_tontine;
create policy "lecture_conditions_tontine"
    on conditions_tontine for select
    using (entreprise_id = entreprise_de_l_utilisateur_connecte());

create or replace function definir_conditions_tontine(p_contenu text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role          text;
    v_entreprise_id uuid;
    v_utilisateur   uuid;
    v_contenu       text := btrim(coalesce(p_contenu, ''));
    v_version       integer;
begin
    select id, role, entreprise_id into v_utilisateur, v_role, v_entreprise_id
    from utilisateurs where auth_user_id = auth.uid();

    if v_role is distinct from 'gerant' then
        raise exception 'Seul le gérant peut définir les conditions de tontine.';
    end if;

    if char_length(v_contenu) < 50 then
        raise exception 'Les conditions doivent contenir au moins 50 caractères.';
    end if;
    if char_length(v_contenu) > 10000 then
        raise exception 'Les conditions ne peuvent pas dépasser 10 000 caractères.';
    end if;

    insert into conditions_tontine (entreprise_id, contenu, version, modifie_par, updated_at)
    values (v_entreprise_id, v_contenu, 1, v_utilisateur, now())
    on conflict (entreprise_id) do update
        set contenu     = excluded.contenu,
            version     = conditions_tontine.version + 1,
            modifie_par = excluded.modifie_par,
            updated_at  = now()
        where conditions_tontine.contenu is distinct from excluded.contenu
    returning version into v_version;

    -- Texte identique : aucune nouvelle version créée.
    if v_version is null then
        select version into v_version from conditions_tontine where entreprise_id = v_entreprise_id;
    end if;

    return v_version;
end;
$$;

revoke all on function definir_conditions_tontine(text) from public, anon;
grant execute on function definir_conditions_tontine(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. ACCEPTATION DES CONDITIONS SUR CHAQUE TONTINE (snapshot figé)
-- ---------------------------------------------------------------------
alter table tontines add column if not exists conditions_acceptees    boolean not null default false;
alter table tontines add column if not exists conditions_version      integer;
alter table tontines add column if not exists conditions_texte        text;
alter table tontines add column if not exists conditions_acceptees_le timestamptz;

create or replace function figer_conditions_tontine()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    v_contenu text;
    v_version integer;
begin
    if tg_op = 'INSERT' then
        if not coalesce(new.conditions_acceptees, false) then
            raise exception 'Le client doit accepter les conditions de la tontine.';
        end if;

        select contenu, version into v_contenu, v_version
        from conditions_tontine where entreprise_id = new.entreprise_id;

        if v_contenu is null then
            raise exception 'Aucune condition de tontine n''est définie. Le gérant doit d''abord les rédiger.';
        end if;

        -- Valeurs imposées par le serveur, quoi qu'envoie le client.
        new.conditions_texte        := v_contenu;
        new.conditions_version      := v_version;
        new.conditions_acceptees_le := now();
        return new;
    end if;

    -- UPDATE : la preuve d'acceptation est immuable.
    if new.conditions_acceptees    is distinct from old.conditions_acceptees
    or new.conditions_version      is distinct from old.conditions_version
    or new.conditions_texte        is distinct from old.conditions_texte
    or new.conditions_acceptees_le is distinct from old.conditions_acceptees_le then
        raise exception 'Les conditions acceptées d''une tontine ne peuvent pas être modifiées.';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_figer_conditions_tontine on tontines;
create trigger trg_figer_conditions_tontine
    before insert or update on tontines
    for each row execute function figer_conditions_tontine();

-- ---------------------------------------------------------------------
-- 4. DURCISSEMENT DES RPC TONTINE (isolation multi-tenant)
-- Ces fonctions sont SECURITY DEFINER (elles contournent la RLS) : elles
-- doivent donc vérifier elles-mêmes que p_entreprise_id est bien
-- l'entreprise de l'appelant. Signatures inchangées → aucun changement
-- côté application.
-- ---------------------------------------------------------------------
create or replace function enregistrer_cotisation_tontine(
    p_tontine_id        uuid,
    p_entreprise_id     uuid,
    p_montant           numeric,
    p_mode_paiement     text,
    p_utilisateur_id    uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_cotisation_id     uuid;
    v_numero_recu       text;
    v_plafond           numeric;
    v_nouveau_cumule    numeric;
    v_statut_actuel     text;
begin
    if p_entreprise_id is distinct from entreprise_de_l_utilisateur_connecte() then
        raise exception 'Accès refusé.';
    end if;

    if p_montant is null or p_montant <= 0 then
        raise exception 'Le montant doit être positif.';
    end if;

    -- Verrou de ligne : deux cotisations simultanées ne peuvent pas
    -- écraser mutuellement le cumul.
    select plafond, montant_cumule, statut into v_plafond, v_nouveau_cumule, v_statut_actuel
    from tontines where id = p_tontine_id and entreprise_id = p_entreprise_id
    for update;

    if v_plafond is null then
        raise exception 'Tontine introuvable.';
    end if;

    if v_statut_actuel = 'cloturee' then
        raise exception 'Cette tontine est déjà clôturée.';
    end if;

    -- Sérialise la numérotation des reçus par entreprise.
    perform pg_advisory_xact_lock(hashtext('recu_tontine_' || p_entreprise_id::text));

    select 'TR-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((count(*) + 1)::text, 4, '0')
    into v_numero_recu
    from cotisations_tontine
    where entreprise_id = p_entreprise_id
      and created_at::date = current_date;

    insert into cotisations_tontine (
        tontine_id, entreprise_id, numero_recu, montant, mode_paiement, utilisateur_id
    )
    values (
        p_tontine_id, p_entreprise_id, v_numero_recu, p_montant,
        coalesce(p_mode_paiement, 'especes'),
        (select id from utilisateurs where auth_user_id = auth.uid())
    )
    returning id into v_cotisation_id;

    v_nouveau_cumule := v_nouveau_cumule + p_montant;

    update tontines
        set montant_cumule = v_nouveau_cumule,
            statut = case when v_nouveau_cumule >= v_plafond then 'atteint' else statut end,
            date_atteinte = case
                when v_nouveau_cumule >= v_plafond and date_atteinte is null then now()
                else date_atteinte
            end
        where id = p_tontine_id;

    return v_cotisation_id;
end;
$$;

create or replace function ajouter_produit_panier_tontine(
    p_tontine_id    uuid,
    p_entreprise_id uuid,
    p_article_id    uuid,
    p_quantite      numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_ligne_id uuid;
begin
    if p_entreprise_id is distinct from entreprise_de_l_utilisateur_connecte() then
        raise exception 'Accès refusé.';
    end if;

    if p_quantite is null or p_quantite <= 0 then
        raise exception 'La quantité doit être positive.';
    end if;

    if not exists (
        select 1 from tontines
        where id = p_tontine_id and entreprise_id = p_entreprise_id and statut <> 'cloturee'
    ) then
        raise exception 'Tontine introuvable ou clôturée.';
    end if;

    if not exists (select 1 from articles where id = p_article_id and entreprise_id = p_entreprise_id) then
        raise exception 'Article introuvable.';
    end if;

    insert into panier_tontine (tontine_id, entreprise_id, article_id, quantite)
    values (p_tontine_id, p_entreprise_id, p_article_id, p_quantite)
    on conflict (tontine_id, article_id)
    do update set quantite = panier_tontine.quantite + excluded.quantite
    returning id into v_ligne_id;

    return v_ligne_id;
end;
$$;

create or replace function recuperer_produits_tontine(
    p_tontine_id        uuid,
    p_entreprise_id     uuid,
    p_utilisateur_id    uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_statut            text;
    v_montant_cumule    numeric;
    v_valeur_panier     numeric;
    v_ligne             record;
    v_stock_avant       numeric;
    v_stock_apres       numeric;
    v_utilisateur       uuid;
begin
    if p_entreprise_id is distinct from entreprise_de_l_utilisateur_connecte() then
        raise exception 'Accès refusé.';
    end if;

    select id into v_utilisateur from utilisateurs where auth_user_id = auth.uid();

    select statut, montant_cumule into v_statut, v_montant_cumule
    from tontines where id = p_tontine_id and entreprise_id = p_entreprise_id
    for update;

    if v_statut is null then
        raise exception 'Tontine introuvable.';
    end if;

    if v_statut <> 'atteint' then
        raise exception 'Le plafond de cette tontine n''est pas encore atteint.';
    end if;

    select coalesce(sum(pt.quantite * a.prix_vente), 0) into v_valeur_panier
    from panier_tontine pt
    join articles a on a.id = pt.article_id
    where pt.tontine_id = p_tontine_id;

    if v_valeur_panier = 0 then
        raise exception 'Le panier de cette tontine est vide.';
    end if;

    if v_valeur_panier > v_montant_cumule then
        raise exception
            'La valeur du panier (% ) dépasse le montant épargné (%).', v_valeur_panier, v_montant_cumule;
    end if;

    for v_ligne in
        select pt.article_id, pt.quantite
        from panier_tontine pt
        where pt.tontine_id = p_tontine_id
    loop
        select stock_actuel into v_stock_avant
        from articles where id = v_ligne.article_id and entreprise_id = p_entreprise_id
        for update;
        v_stock_apres := v_stock_avant - v_ligne.quantite;

        insert into mouvements_stock (
            entreprise_id, article_id, type_mouvement,
            quantite, quantite_avant, quantite_apres,
            motif, reference_document, utilisateur_id
        )
        values (
            p_entreprise_id, v_ligne.article_id, 'sortie_vente',
            -v_ligne.quantite, v_stock_avant, v_stock_apres,
            'Retrait tontine', p_tontine_id, v_utilisateur
        );

        update articles
            set stock_actuel = v_stock_apres, updated_at = now()
            where id = v_ligne.article_id;
    end loop;

    delete from panier_tontine where tontine_id = p_tontine_id;

    update tontines set statut = 'cloturee' where id = p_tontine_id;
end;
$$;

revoke all on function enregistrer_cotisation_tontine(uuid, uuid, numeric, text, uuid) from public, anon;
revoke all on function ajouter_produit_panier_tontine(uuid, uuid, uuid, numeric) from public, anon;
revoke all on function recuperer_produits_tontine(uuid, uuid, uuid) from public, anon;
grant execute on function enregistrer_cotisation_tontine(uuid, uuid, numeric, text, uuid) to authenticated;
grant execute on function ajouter_produit_panier_tontine(uuid, uuid, uuid, numeric) to authenticated;
grant execute on function recuperer_produits_tontine(uuid, uuid, uuid) to authenticated;
