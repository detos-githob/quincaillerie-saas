-- =====================================================================
-- MIGRATION : OFFRES, CODES PROMO ET AGENTS COMMERCIAUX
-- À exécuter après migration_hors_ligne_stock.sql.
--
--   1. Les offres d'abonnement (prix, nombre de comptes, modules inclus,
--      durée de l'essai) quittent le code : elles sont en base et se
--      gèrent depuis l'espace super admin.
--   2. Agents commerciaux : chaque agent a un compte de connexion, un
--      taux de commission et ses codes promo.
--   3. Codes promo : réduction en % ou montant fixe, limitée dans le
--      temps, en nombre d'utilisations, par offre et par périodicité.
--   4. Le prix final (offre + code) est TOUJOURS calculé ici, côté
--      serveur ; le navigateur ne fait qu'afficher.
--   5. Commission enregistrée automatiquement à chaque paiement confirmé
--      fait avec le code d'un agent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. OFFRES
-- ---------------------------------------------------------------------
-- Modules « premium » qu'une offre peut inclure ou non. Les autres
-- modules (ventes, stock, clients, factures, tontine, clôtures,
-- livraisons, équipe) sont inclus dans toutes les offres.
create table if not exists offres (
    id                 text primary key check (id ~ '^[a-z0-9_]{2,30}$'),
    nom                text not null check (char_length(nom) between 2 and 40),
    description        text not null default '' check (char_length(description) <= 160),
    prix_mensuel       numeric(12,2) not null default 0 check (prix_mensuel >= 0),
    prix_annuel        numeric(12,2) not null default 0 check (prix_annuel >= 0),
    max_utilisateurs   integer not null default 2 check (max_utilisateurs between 1 and 500),
    modules            text[] not null default '{}'
                       check (modules <@ array['fournisseurs','depot_boissons','depenses','tableau_decisionnel']),
    avantages          text[] not null default '{}',
    est_essai          boolean not null default false,
    duree_essai_jours  integer check (duree_essai_jours is null or duree_essai_jours between 1 and 365),
    -- Visible sur la page Offres et la page d'accueil, et payable.
    publique           boolean not null default true,
    recommandee        boolean not null default false,
    -- Désactivée : plus proposée, mais les commerces qui l'ont la gardent.
    active             boolean not null default true,
    ordre              integer not null default 0,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

-- Une seule offre d'essai.
create unique index if not exists uq_offres_essai on offres(est_essai) where est_essai;

insert into offres (id, nom, description, prix_mensuel, prix_annuel, max_utilisateurs, modules, avantages,
                    est_essai, duree_essai_jours, publique, recommandee, ordre)
values
    ('essai', 'Essai', 'Pour découvrir Akweo avec vos vrais articles.', 0, 0, 2, '{}',
     array['Toutes les fonctions de l''offre Starter', '2 comptes utilisateurs', 'Aucune carte ni paiement demandé'],
     true, 7, false, false, 0),
    ('starter', 'Starter', 'Pour la boutique tenue par le gérant et un vendeur.', 3000, 35000, 2, '{}',
     array['Ventes et factures', 'Stock et inventaires', 'Clients et crédits', 'Tontine clients', 'Livraisons',
           'Clôture de caisse', 'Fonctionne hors connexion', '2 comptes utilisateurs'],
     false, null, true, false, 1),
    ('business', 'Business', 'Pour les grossistes, semi-grossistes et dépôts.', 5000, 55000, 5,
     array['fournisseurs','depot_boissons','depenses','tableau_decisionnel'],
     array['Tout Starter', '5 comptes utilisateurs', 'Fournisseurs et commandes', 'Dépôt de boissons et consignes',
           'Personnel et dépenses', 'Tableau de bord décisionnel'],
     false, null, true, true, 2),
    -- Ancien palier : conservé pour les commerces qui l'auraient, non proposé.
    ('pro', 'Pro', 'Ancienne offre.', 5000, 55000, 5,
     array['fournisseurs','depot_boissons','depenses','tableau_decisionnel'], '{}',
     false, null, false, false, 99)
on conflict (id) do nothing;

-- Le palier d'une entreprise doit exister dans les offres (remplace la
-- liste figée essai/starter/business/pro).
alter table entreprises drop constraint if exists entreprises_plan_abonnement_check;
do $$
begin
    insert into offres (id, nom, publique, active, modules)
    select distinct e.plan_abonnement, initcap(e.plan_abonnement), false, false,
           array['fournisseurs','depot_boissons','depenses','tableau_decisionnel']
    from entreprises e
    where e.plan_abonnement is not null
      and not exists (select 1 from offres o where o.id = e.plan_abonnement)
      and e.plan_abonnement ~ '^[a-z0-9_]{2,30}$';
    if not exists (select 1 from pg_constraint where conname = 'entreprises_plan_abonnement_fkey') then
        alter table entreprises
            add constraint entreprises_plan_abonnement_fkey
            foreign key (plan_abonnement) references offres(id) on update cascade;
    end if;
end $$;

alter table offres enable row level security;
-- Les offres sont publiques (page d'accueil, page Offres) : lecture pour
-- tous, y compris visiteurs. Écriture uniquement par les fonctions admin.
drop policy if exists "lecture_offres" on offres;
create policy "lecture_offres" on offres for select using (true);
grant select on offres to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. AGENTS COMMERCIAUX
-- ---------------------------------------------------------------------
create table if not exists agents_commerciaux (
    id                 uuid primary key default gen_random_uuid(),
    auth_user_id       uuid unique,      -- compte de connexion (créé par l'Edge Function)
    nom                text not null check (char_length(nom) between 2 and 80),
    email              text not null,
    telephone          text,
    taux_commission    numeric(5,2) not null default 10 check (taux_commission between 0 and 100),
    actif              boolean not null default true,
    created_at         timestamptz not null default now()
);

alter table agents_commerciaux enable row level security;
drop policy if exists "agent_lit_sa_fiche" on agents_commerciaux;
create policy "agent_lit_sa_fiche" on agents_commerciaux for select
    using (auth_user_id = auth.uid() or est_super_admin());

create or replace function agent_connecte()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select id from agents_commerciaux where auth_user_id = auth.uid() and actif;
$$;

-- ---------------------------------------------------------------------
-- 3. CODES PROMO
-- ---------------------------------------------------------------------
create table if not exists codes_promo (
    id                       uuid primary key default gen_random_uuid(),
    code                     text not null check (code ~ '^[A-Z0-9-]{3,20}$'),
    agent_id                 uuid references agents_commerciaux(id) on delete set null,
    type_reduction           text not null check (type_reduction in ('pourcentage', 'montant')),
    valeur                   numeric(12,2) not null check (valeur > 0),
    offres                   text[],      -- null = toutes les offres payantes
    periodicites             text[],      -- null = mensuel et annuel
    premier_paiement_seulement boolean not null default false,
    date_debut               date,
    date_fin                 date,
    max_utilisations         integer check (max_utilisations is null or max_utilisations > 0),
    utilisations             integer not null default 0,
    actif                    boolean not null default true,
    created_at               timestamptz not null default now(),
    check (type_reduction <> 'pourcentage' or valeur <= 90),
    check (date_fin is null or date_debut is null or date_fin >= date_debut),
    check (periodicites is null or periodicites <@ array['mensuel','annuel'])
);
create unique index if not exists uq_codes_promo_code on codes_promo(upper(code));

alter table codes_promo enable row level security;
-- Un agent voit ses propres codes ; personne d'autre ne peut lister les
-- codes (un code se vérifie par la fonction dédiée).
drop policy if exists "lecture_codes_promo" on codes_promo;
create policy "lecture_codes_promo" on codes_promo for select
    using (est_super_admin() or (agent_id is not null and agent_id = agent_connecte()));

-- ---------------------------------------------------------------------
-- 4. LIENS PAIEMENTS / ENTREPRISES / COMMISSIONS
-- ---------------------------------------------------------------------
alter table paiements_abonnement drop constraint if exists paiements_abonnement_plan_check;
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'paiements_abonnement_plan_fkey') then
        alter table paiements_abonnement
            add constraint paiements_abonnement_plan_fkey foreign key (plan) references offres(id) on update cascade;
    end if;
end $$;
alter table paiements_abonnement add column if not exists code_promo_id     uuid references codes_promo(id) on delete set null;
alter table paiements_abonnement add column if not exists montant_avant_promo numeric(12,2);
alter table paiements_abonnement add column if not exists reduction          numeric(12,2) not null default 0;

-- Agent qui a apporté le commerce (premier code d'agent utilisé).
alter table entreprises add column if not exists agent_id uuid references agents_commerciaux(id) on delete set null;

create table if not exists commissions (
    id                  uuid primary key default gen_random_uuid(),
    agent_id            uuid not null references agents_commerciaux(id) on delete cascade,
    paiement_id         uuid not null unique references paiements_abonnement(id) on delete cascade,
    entreprise_id       uuid not null references entreprises(id) on delete cascade,
    montant_base        numeric(12,2) not null,
    taux                numeric(5,2) not null,
    montant             numeric(12,2) not null,
    statut              text not null default 'due' check (statut in ('due', 'payee')),
    payee_le            timestamptz,
    created_at          timestamptz not null default now()
);
create index if not exists idx_commissions_agent on commissions(agent_id, created_at desc);

alter table commissions enable row level security;
drop policy if exists "lecture_commissions" on commissions;
create policy "lecture_commissions" on commissions for select
    using (est_super_admin() or agent_id = agent_connecte());

-- ---------------------------------------------------------------------
-- 5. CALCUL DU PRIX (offre + code promo)
-- ---------------------------------------------------------------------
create or replace function calculer_prix_abonnement(
    p_entreprise_id uuid,
    p_plan          text,
    p_periodicite   text,
    p_code          text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_offre  offres%rowtype;
    v_c      codes_promo%rowtype;
    v_base   numeric;
    v_red    numeric := 0;
    v_code   text := upper(btrim(coalesce(p_code, '')));
begin
    select * into v_offre from offres where id = p_plan and active and publique and not est_essai;
    if not found or p_periodicite not in ('mensuel', 'annuel') then
        return jsonb_build_object('erreur', 'Offre invalide.');
    end if;
    v_base := case when p_periodicite = 'annuel' then v_offre.prix_annuel else v_offre.prix_mensuel end;
    if v_base <= 0 then
        return jsonb_build_object('erreur', 'Cette offre n''est pas disponible à la vente.');
    end if;

    if v_code = '' then
        return jsonb_build_object('montant_base', v_base, 'reduction', 0, 'montant', v_base,
                                  'offre_nom', v_offre.nom);
    end if;

    select * into v_c from codes_promo where upper(code) = v_code;
    if not found or not v_c.actif
       or (v_c.agent_id is not null and not exists (select 1 from agents_commerciaux a where a.id = v_c.agent_id and a.actif)) then
        return jsonb_build_object('erreur', 'Code promo invalide.');
    end if;
    if v_c.date_debut is not null and current_date < v_c.date_debut then
        return jsonb_build_object('erreur', 'Ce code promo n''est pas encore valable.');
    end if;
    if v_c.date_fin is not null and current_date > v_c.date_fin then
        return jsonb_build_object('erreur', 'Ce code promo a expiré.');
    end if;
    if v_c.max_utilisations is not null and v_c.utilisations >= v_c.max_utilisations then
        return jsonb_build_object('erreur', 'Ce code promo a atteint son nombre maximal d''utilisations.');
    end if;
    if v_c.offres is not null and not (p_plan = any (v_c.offres)) then
        return jsonb_build_object('erreur', 'Ce code promo ne s''applique pas à l''offre ' || v_offre.nom || '.');
    end if;
    if v_c.periodicites is not null and not (p_periodicite = any (v_c.periodicites)) then
        return jsonb_build_object('erreur', 'Ce code promo ne s''applique pas à la formule ' || p_periodicite || '.');
    end if;
    if v_c.premier_paiement_seulement and p_entreprise_id is not null and exists (
        select 1 from paiements_abonnement where entreprise_id = p_entreprise_id and statut = 'reussi') then
        return jsonb_build_object('erreur', 'Ce code promo est réservé au premier abonnement.');
    end if;

    v_red := case when v_c.type_reduction = 'pourcentage'
                  then round(v_base * v_c.valeur / 100)
                  else least(v_c.valeur, v_base) end;
    -- Un paiement Mobile Money doit rester supérieur à zéro.
    if v_base - v_red < 100 then
        return jsonb_build_object('erreur', 'Ce code promo ne peut pas s''appliquer à ce montant.');
    end if;

    return jsonb_build_object(
        'montant_base', v_base, 'reduction', v_red, 'montant', v_base - v_red,
        'offre_nom', v_offre.nom, 'code_promo_id', v_c.id, 'code', upper(v_c.code),
        'description_reduction', case when v_c.type_reduction = 'pourcentage'
                                      then '-' || trim(to_char(v_c.valeur, 'FM999990.##')) || ' %'
                                      else '-' || trim(to_char(v_c.valeur, 'FM999G999G990')) || ' F' end);
end;
$$;

-- Aperçu pour le gérant connecté (page de paiement).
create or replace function apercu_prix_abonnement(p_plan text, p_periodicite text, p_code text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_ent uuid;
begin
    select entreprise_id into v_ent from utilisateurs where auth_user_id = auth.uid() and role = 'gerant' and actif;
    if v_ent is null then
        raise exception 'Seul le gérant peut souscrire un abonnement.' using errcode = '42501';
    end if;
    -- Ne pas exposer l'identifiant interne du code au navigateur.
    return calculer_prix_abonnement(v_ent, p_plan, p_periodicite, p_code) - 'code_promo_id';
end;
$$;

-- ---------------------------------------------------------------------
-- 6. APPLICATION D'UN PAIEMENT CONFIRMÉ (remplace la version précédente)
-- ---------------------------------------------------------------------
create or replace function appliquer_paiement_abonnement(
    p_paiement_id           uuid,
    p_montant_confirme      numeric,
    p_reference_fournisseur text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_p         paiements_abonnement%rowtype;
    v_exp       date;
    v_base      date;
    v_nouvelle  date;
    v_agent     agents_commerciaux%rowtype;
begin
    select * into v_p from paiements_abonnement where id = p_paiement_id for update;
    if not found then
        raise exception 'Paiement introuvable.';
    end if;

    if v_p.statut = 'reussi' then
        return jsonb_build_object('deja_applique', true, 'date_expiration', v_p.date_expiration_apres);
    end if;
    if v_p.statut not in ('en_attente', 'expire') then
        raise exception 'Ce paiement ne peut plus être validé (statut : %).', v_p.statut;
    end if;

    if p_montant_confirme is null or p_montant_confirme < v_p.montant then
        update paiements_abonnement
            set statut = 'echoue', raison_echec = 'Montant confirmé insuffisant : ' || coalesce(p_montant_confirme::text, 'inconnu'),
                updated_at = now()
            where id = v_p.id;
        return jsonb_build_object('erreur', 'Le montant payé ne correspond pas à l''offre.');
    end if;

    select date_expiration_abonnement into v_exp from entreprises where id = v_p.entreprise_id for update;
    v_base := greatest(current_date, coalesce(v_exp, current_date));
    v_nouvelle := (v_base + case when v_p.periodicite = 'annuel' then interval '1 year' else interval '1 month' end)::date;

    update entreprises
        set plan_abonnement = v_p.plan,
            periodicite_abonnement = v_p.periodicite,
            date_expiration_abonnement = v_nouvelle,
            actif = true,
            derniere_alerte_envoyee = null
        where id = v_p.entreprise_id;

    update paiements_abonnement
        set statut = 'reussi',
            reference_fournisseur = coalesce(p_reference_fournisseur, reference_fournisseur),
            date_expiration_avant = v_exp,
            date_expiration_apres = v_nouvelle,
            confirme_le = now(),
            raison_echec = null,
            updated_at = now()
        where id = v_p.id;

    -- Code promo : utilisation comptée, commerce rattaché à l'agent,
    -- commission enregistrée sur le montant réellement payé.
    if v_p.code_promo_id is not null then
        update codes_promo set utilisations = utilisations + 1 where id = v_p.code_promo_id;

        select a.* into v_agent from codes_promo c join agents_commerciaux a on a.id = c.agent_id
        where c.id = v_p.code_promo_id;
        if found then
            update entreprises set agent_id = v_agent.id where id = v_p.entreprise_id and agent_id is null;
            if v_agent.taux_commission > 0 then
                insert into commissions (agent_id, paiement_id, entreprise_id, montant_base, taux, montant)
                values (v_agent.id, v_p.id, v_p.entreprise_id, v_p.montant, v_agent.taux_commission,
                        round(v_p.montant * v_agent.taux_commission / 100))
                on conflict (paiement_id) do nothing;
            end if;
        end if;
    end if;

    insert into journal_audit (entreprise_id, utilisateur_id, action, table_concernee, enregistrement_id, donnees_apres)
    values (v_p.entreprise_id, v_p.cree_par, 'paiement_abonnement', 'paiements_abonnement', v_p.id,
            jsonb_build_object('fournisseur', v_p.fournisseur, 'plan', v_p.plan, 'periodicite', v_p.periodicite,
                               'montant', v_p.montant, 'reduction', v_p.reduction, 'expiration', v_nouvelle));

    return jsonb_build_object('deja_applique', false, 'date_expiration', v_nouvelle);
end;
$$;

-- ---------------------------------------------------------------------
-- 7. ESSAI : durée lue dans l'offre d'essai (remplace la valeur figée)
-- ---------------------------------------------------------------------
-- Ancienne version à 4 paramètres (avant l'essai gratuit) : encore
-- appelable par l'API, elle créait une entreprise SANS date d'expiration,
-- donc un accès illimité gratuit. L'application ne l'utilise plus.
drop function if exists creer_entreprise_et_gerant(text, text, text, text);

create or replace function creer_entreprise_et_gerant(
    p_nom_entreprise         text,
    p_regime_fiscal          text,
    p_telephone              text,
    p_nom_gerant             text,
    p_secteur_activite       text default 'autre',
    p_secteur_activite_autre text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_entreprise_id uuid;
    v_uid uuid := auth.uid();
    v_essai offres%rowtype;
begin
    if v_uid is null then
        raise exception 'Utilisateur non authentifié.';
    end if;
    if exists (select 1 from utilisateurs where auth_user_id = v_uid) then
        raise exception 'Ce compte est déjà associé à une entreprise.';
    end if;
    if exists (select 1 from agents_commerciaux where auth_user_id = v_uid) then
        raise exception 'Un compte d''agent commercial ne peut pas créer d''entreprise.';
    end if;
    if coalesce(p_secteur_activite, 'autre') not in
        ('quincaillerie', 'depot_boissons', 'alimentation_generale', 'pieces_detachees', 'autre') then
        raise exception 'Secteur d''activité invalide : %', p_secteur_activite;
    end if;

    select * into v_essai from offres where est_essai limit 1;

    insert into entreprises (
        nom, regime_fiscal, telephone, secteur_activite, secteur_activite_autre,
        plan_abonnement, periodicite_abonnement, date_expiration_abonnement
    )
    values (
        p_nom_entreprise,
        coalesce(p_regime_fiscal, 'forfait'),
        p_telephone,
        coalesce(p_secteur_activite, 'autre'),
        case when p_secteur_activite = 'autre' then p_secteur_activite_autre else null end,
        coalesce(v_essai.id, 'essai'),
        'mensuel',
        (current_date + make_interval(days => coalesce(v_essai.duree_essai_jours, 7)))::date
    )
    returning id into v_entreprise_id;

    insert into utilisateurs (entreprise_id, auth_user_id, nom, role)
    values (v_entreprise_id, v_uid, p_nom_gerant, 'gerant');

    return v_entreprise_id;
end;
$$;

-- Plafond de comptes de l'équipe, lu dans l'offre (Edge Function).
create or replace function limite_utilisateurs_entreprise(p_entreprise_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
    -- Offre inconnue : on ne bloque jamais un client payant (5 comptes).
    select coalesce((select o.max_utilisateurs from entreprises e join offres o on o.id = e.plan_abonnement
                     where e.id = p_entreprise_id), 5);
$$;

-- ---------------------------------------------------------------------
-- 8. FONCTIONS SUPER ADMIN
-- ---------------------------------------------------------------------
create or replace function exiger_super_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not est_super_admin() then
        raise exception 'Accès réservé aux administrateurs.' using errcode = '42501';
    end if;
end;
$$;

create or replace function admin_enregistrer_offre(p jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id text := lower(btrim(coalesce(p->>'id', '')));
    v_existe boolean;
    v_avantages text[];
    v_modules text[];
begin
    perform exiger_super_admin();
    if v_id !~ '^[a-z0-9_]{2,30}$' then
        raise exception 'Identifiant invalide : 2 à 30 caractères, lettres minuscules, chiffres ou _.';
    end if;
    select array(select btrim(x) from jsonb_array_elements_text(coalesce(p->'avantages', '[]')) x where btrim(x) <> '')
        into v_avantages;
    select array(select x from jsonb_array_elements_text(coalesce(p->'modules', '[]')) x) into v_modules;
    if not (v_modules <@ array['fournisseurs','depot_boissons','depenses','tableau_decisionnel']) then
        raise exception 'Module inconnu dans la liste.';
    end if;
    if char_length(btrim(coalesce(p->>'nom', ''))) < 2 then
        raise exception 'Le nom de l''offre est obligatoire.';
    end if;
    select exists (select 1 from offres where id = v_id) into v_existe;

    if coalesce((p->>'recommandee')::boolean, false) then
        update offres set recommandee = false where id <> v_id;
    end if;

    if v_existe then
        update offres set
            nom = btrim(p->>'nom'),
            description = coalesce(btrim(p->>'description'), ''),
            prix_mensuel = coalesce((p->>'prix_mensuel')::numeric, 0),
            prix_annuel = coalesce((p->>'prix_annuel')::numeric, 0),
            max_utilisateurs = coalesce((p->>'max_utilisateurs')::integer, 2),
            modules = v_modules,
            avantages = v_avantages,
            duree_essai_jours = case when est_essai then coalesce((p->>'duree_essai_jours')::integer, 7) else null end,
            publique = case when est_essai then false else coalesce((p->>'publique')::boolean, true) end,
            recommandee = case when est_essai then false else coalesce((p->>'recommandee')::boolean, false) end,
            active = case when est_essai then true else coalesce((p->>'active')::boolean, true) end,
            ordre = coalesce((p->>'ordre')::integer, ordre),
            updated_at = now()
        where id = v_id;
    else
        insert into offres (id, nom, description, prix_mensuel, prix_annuel, max_utilisateurs, modules, avantages,
                            publique, recommandee, active, ordre)
        values (v_id, btrim(p->>'nom'), coalesce(btrim(p->>'description'), ''),
                coalesce((p->>'prix_mensuel')::numeric, 0), coalesce((p->>'prix_annuel')::numeric, 0),
                coalesce((p->>'max_utilisateurs')::integer, 2), v_modules, v_avantages,
                coalesce((p->>'publique')::boolean, true), coalesce((p->>'recommandee')::boolean, false),
                coalesce((p->>'active')::boolean, true),
                coalesce((p->>'ordre')::integer, (select coalesce(max(ordre), 0) + 1 from offres where ordre < 99)));
    end if;

    if exists (select 1 from offres where id = v_id and publique and active and not est_essai
               and (prix_mensuel <= 0 or prix_annuel <= 0)) then
        raise exception 'Une offre proposée à la vente doit avoir un prix mensuel et annuel supérieurs à zéro.';
    end if;
    return v_id;
end;
$$;

create or replace function admin_enregistrer_agent(p_id uuid, p_nom text, p_telephone text, p_taux numeric, p_actif boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    perform exiger_super_admin();
    update agents_commerciaux
        set nom = btrim(p_nom), telephone = nullif(btrim(coalesce(p_telephone, '')), ''),
            taux_commission = p_taux, actif = p_actif
        where id = p_id;
    if not found then raise exception 'Agent introuvable.'; end if;
end;
$$;

create or replace function admin_enregistrer_code_promo(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id uuid := nullif(p->>'id', '')::uuid;
    v_code text := upper(btrim(coalesce(p->>'code', '')));
    v_offres text[];
    v_period text[];
begin
    perform exiger_super_admin();
    if v_code !~ '^[A-Z0-9-]{3,20}$' then
        raise exception 'Code invalide : 3 à 20 caractères, lettres, chiffres ou tiret.';
    end if;
    if p->>'type_reduction' not in ('pourcentage', 'montant') or coalesce((p->>'valeur')::numeric, 0) <= 0 then
        raise exception 'Indique le type de réduction et une valeur supérieure à zéro.';
    end if;
    if p->>'type_reduction' = 'pourcentage' and (p->>'valeur')::numeric > 90 then
        raise exception 'Une réduction en pourcentage ne peut pas dépasser 90 %%.';
    end if;
    if nullif(p->>'date_debut', '') is not null and nullif(p->>'date_fin', '') is not null
       and (p->>'date_fin')::date < (p->>'date_debut')::date then
        raise exception 'La date de fin doit être après la date de début.';
    end if;
    if exists (select 1 from codes_promo where upper(code) = v_code and id is distinct from v_id) then
        raise exception 'Le code % existe déjà.', v_code;
    end if;
    select case when jsonb_typeof(p->'offres') = 'array' and jsonb_array_length(p->'offres') > 0
                then array(select x from jsonb_array_elements_text(p->'offres') x) end into v_offres;
    select case when jsonb_typeof(p->'periodicites') = 'array' and jsonb_array_length(p->'periodicites') between 1 and 1
                then array(select x from jsonb_array_elements_text(p->'periodicites') x) end into v_period;
    if v_offres is not null and exists (select 1 from unnest(v_offres) o where o not in (select id from offres)) then
        raise exception 'Offre inconnue dans la liste.';
    end if;

    if v_id is null then
        insert into codes_promo (code, agent_id, type_reduction, valeur, offres, periodicites,
                                 premier_paiement_seulement, date_debut, date_fin, max_utilisations, actif)
        values (v_code, nullif(p->>'agent_id', '')::uuid, p->>'type_reduction', (p->>'valeur')::numeric,
                v_offres, v_period, coalesce((p->>'premier_paiement_seulement')::boolean, false),
                nullif(p->>'date_debut', '')::date, nullif(p->>'date_fin', '')::date,
                nullif(p->>'max_utilisations', '')::integer, coalesce((p->>'actif')::boolean, true))
        returning id into v_id;
    else
        update codes_promo set
            code = v_code, agent_id = nullif(p->>'agent_id', '')::uuid,
            type_reduction = p->>'type_reduction', valeur = (p->>'valeur')::numeric,
            offres = v_offres, periodicites = v_period,
            premier_paiement_seulement = coalesce((p->>'premier_paiement_seulement')::boolean, false),
            date_debut = nullif(p->>'date_debut', '')::date, date_fin = nullif(p->>'date_fin', '')::date,
            max_utilisations = nullif(p->>'max_utilisations', '')::integer,
            actif = coalesce((p->>'actif')::boolean, true)
        where id = v_id;
        if not found then raise exception 'Code promo introuvable.'; end if;
    end if;
    return v_id;
end;
$$;

create or replace function admin_marquer_commissions_payees(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_n integer;
begin
    perform exiger_super_admin();
    update commissions set statut = 'payee', payee_le = now()
        where id = any (p_ids) and statut = 'due';
    get diagnostics v_n = row_count;
    return v_n;
end;
$$;

-- Statistiques : codes (utilisations, chiffre généré), agents (commerces,
-- commissions dues/payées). Super admin : tout ; agent : les siennes.
create or replace function statistiques_promotions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_agent uuid := agent_connecte();
    v_admin boolean := est_super_admin();
begin
    if not v_admin and v_agent is null then
        raise exception 'Accès refusé.' using errcode = '42501';
    end if;
    return jsonb_build_object(
        'codes', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', c.id, 'code', c.code, 'agent_id', c.agent_id, 'utilisations', c.utilisations,
                'chiffre_affaires', coalesce((select sum(pa.montant) from paiements_abonnement pa
                                              where pa.code_promo_id = c.id and pa.statut = 'reussi'), 0),
                'reductions', coalesce((select sum(pa.reduction) from paiements_abonnement pa
                                        where pa.code_promo_id = c.id and pa.statut = 'reussi'), 0)
            ) order by c.created_at desc)
            from codes_promo c where v_admin or c.agent_id = v_agent), '[]'::jsonb),
        'agents', coalesce((
            select jsonb_agg(jsonb_build_object(
                'agent_id', a.id,
                'commerces', (select count(*) from entreprises e where e.agent_id = a.id),
                'commission_due', coalesce((select sum(montant) from commissions k where k.agent_id = a.id and k.statut = 'due'), 0),
                'commission_payee', coalesce((select sum(montant) from commissions k where k.agent_id = a.id and k.statut = 'payee'), 0)
            ))
            from agents_commerciaux a where v_admin or a.id = v_agent), '[]'::jsonb)
    );
end;
$$;

-- Commerces apportés par l'agent connecté (nom, offre, date : jamais de
-- chiffres de vente).
create or replace function mes_commerces_agent()
returns table (nom text, plan text, date_expiration date, inscrit_le timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_agent uuid := agent_connecte();
begin
    if v_agent is null then
        raise exception 'Accès refusé.' using errcode = '42501';
    end if;
    return query
    select e.nom, o.nom, e.date_expiration_abonnement, e.created_at
    from entreprises e left join offres o on o.id = e.plan_abonnement
    where e.agent_id = v_agent
    order by e.created_at desc;
end;
$$;

-- Liste des commissions pour l'espace admin (avec noms).
create or replace function admin_lister_commissions()
returns table (id uuid, agent_id uuid, agent text, entreprise text, montant_base numeric, taux numeric,
               montant numeric, statut text, created_at timestamptz, payee_le timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    perform exiger_super_admin();
    return query
    select k.id, k.agent_id, a.nom, e.nom, k.montant_base, k.taux, k.montant, k.statut, k.created_at, k.payee_le
    from commissions k join agents_commerciaux a on a.id = k.agent_id join entreprises e on e.id = k.entreprise_id
    order by k.created_at desc
    limit 500;
end;
$$;

create or replace function mes_commissions_agent()
returns table (entreprise text, montant_base numeric, taux numeric, montant numeric, statut text,
               created_at timestamptz, payee_le timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_agent uuid := agent_connecte();
begin
    if v_agent is null then
        raise exception 'Accès refusé.' using errcode = '42501';
    end if;
    return query
    select e.nom, k.montant_base, k.taux, k.montant, k.statut, k.created_at, k.payee_le
    from commissions k join entreprises e on e.id = k.entreprise_id
    where k.agent_id = v_agent
    order by k.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. DROITS
-- ---------------------------------------------------------------------
revoke all on function creer_entreprise_et_gerant(text, text, text, text, text, text) from public, anon;
grant execute on function creer_entreprise_et_gerant(text, text, text, text, text, text) to authenticated;
revoke all on function calculer_prix_abonnement(uuid, text, text, text) from public, anon, authenticated;
grant execute on function calculer_prix_abonnement(uuid, text, text, text) to service_role;
revoke all on function limite_utilisateurs_entreprise(uuid) from public, anon, authenticated;
grant execute on function limite_utilisateurs_entreprise(uuid) to service_role;
revoke all on function exiger_super_admin() from public, anon, authenticated;

revoke all on function agent_connecte() from public, anon;
revoke all on function apercu_prix_abonnement(text, text, text) from public, anon;
revoke all on function admin_enregistrer_offre(jsonb) from public, anon;
revoke all on function admin_enregistrer_agent(uuid, text, text, numeric, boolean) from public, anon;
revoke all on function admin_enregistrer_code_promo(jsonb) from public, anon;
revoke all on function admin_marquer_commissions_payees(uuid[]) from public, anon;
revoke all on function statistiques_promotions() from public, anon;
revoke all on function mes_commerces_agent() from public, anon;
revoke all on function admin_lister_commissions() from public, anon;
revoke all on function mes_commissions_agent() from public, anon;
grant execute on function agent_connecte() to authenticated;
grant execute on function apercu_prix_abonnement(text, text, text) to authenticated;
grant execute on function admin_enregistrer_offre(jsonb) to authenticated;
grant execute on function admin_enregistrer_agent(uuid, text, text, numeric, boolean) to authenticated;
grant execute on function admin_enregistrer_code_promo(jsonb) to authenticated;
grant execute on function admin_marquer_commissions_payees(uuid[]) to authenticated;
grant execute on function statistiques_promotions() to authenticated;
grant execute on function mes_commerces_agent() to authenticated;
grant execute on function admin_lister_commissions() to authenticated;
grant execute on function mes_commissions_agent() to authenticated;

grant select on agents_commerciaux, codes_promo, commissions to authenticated;
grant all on offres, agents_commerciaux, codes_promo, commissions to service_role;
