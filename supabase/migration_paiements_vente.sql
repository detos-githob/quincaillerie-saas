-- =====================================================================
-- AKWEO : paiement électronique des ventes (MTN, Moov, Celtiis)
-- À exécuter APRÈS migration_secteurs_par_offre.sql
--
-- 1. comptes_paiement           : comptes marchands configurés par le gérant
--                                 (FedaPay ou API MTN MoMo directe)
-- 2. comptes_paiement_secrets   : clés API CHIFFRÉES (AES-256-GCM, la clé de
--                                 chiffrement n'existe que dans les secrets des
--                                 Edge Functions). Aucun accès depuis le navigateur.
-- 3. paiements_vente            : chaque demande envoyée sur le téléphone d'un client
-- 4. ventes.paiement_vente_id   : lien vente ↔ paiement confirmé
-- 5. synchroniser_vente         : nouveau paramètre p_paiement_id. Une vente
--                                 payée électroniquement n'est créée que si le
--                                 paiement est confirmé, non encore utilisé, et
--                                 couvre le total de la vente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. COMPTES MARCHANDS
-- ---------------------------------------------------------------------
create table if not exists comptes_paiement (
    id             uuid primary key default gen_random_uuid(),
    entreprise_id  uuid not null references entreprises(id) on delete cascade,
    fournisseur    text not null check (fournisseur in ('fedapay', 'mtn_momo')),
    libelle        text not null default '',
    environnement  text not null default 'test' check (environnement in ('test', 'production')),
    operateurs     text[] not null default '{}',
    actif          boolean not null default true,
    apercu_cle     text,
    verifie_le     timestamptz,
    cree_par       uuid references utilisateurs(id) on delete set null,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    constraint comptes_paiement_operateurs_valides check (
        cardinality(operateurs) >= 1 and operateurs <@ array['mtn', 'moov', 'celtiis']::text[]
    ),
    constraint comptes_paiement_mtn_seul check (fournisseur <> 'mtn_momo' or operateurs = array['mtn']::text[])
);
create index if not exists idx_comptes_paiement_entreprise on comptes_paiement(entreprise_id);

create table if not exists comptes_paiement_secrets (
    compte_id      uuid primary key references comptes_paiement(id) on delete cascade,
    cles_chiffrees text not null,
    updated_at     timestamptz not null default now()
);

alter table comptes_paiement enable row level security;
alter table comptes_paiement_secrets enable row level security;

-- Lecture (sans les clés) pour les membres de l'entreprise : la caisse
-- doit connaître les opérateurs disponibles. Écritures : uniquement par
-- l'Edge Function comptes-paiement (service role) qui chiffre les clés.
drop policy if exists "lecture_comptes_paiement" on comptes_paiement;
create policy "lecture_comptes_paiement" on comptes_paiement
    for select to authenticated
    using (entreprise_id = entreprise_de_l_utilisateur_connecte());

revoke insert, update, delete on comptes_paiement from anon, authenticated;
revoke all on comptes_paiement_secrets from anon, authenticated;
-- (aucune policy sur comptes_paiement_secrets : invisible hors service role)

-- ---------------------------------------------------------------------
-- 2. PAIEMENTS DE VENTE
-- ---------------------------------------------------------------------
create table if not exists paiements_vente (
    id                    uuid primary key default gen_random_uuid(),
    entreprise_id         uuid not null references entreprises(id) on delete cascade,
    compte_id             uuid references comptes_paiement(id) on delete set null,
    fournisseur           text not null check (fournisseur in ('fedapay', 'mtn_momo')),
    operateur             text not null check (operateur in ('mtn', 'moov', 'celtiis')),
    environnement         text not null check (environnement in ('test', 'production')),
    montant               integer not null check (montant > 0),
    devise                text not null default 'XOF',
    telephone             text not null,
    statut                text not null default 'en_attente'
                          check (statut in ('en_attente', 'reussi', 'echoue', 'expire', 'annule')),
    reference_fournisseur text,
    raison                text,
    vente_id              uuid unique references ventes(id) on delete set null,
    utilisateur_id        uuid references utilisateurs(id) on delete set null,
    created_at            timestamptz not null default now(),
    confirme_le           timestamptz,
    mis_a_jour_le         timestamptz not null default now()
);
create index if not exists idx_paiements_vente_entreprise on paiements_vente(entreprise_id, created_at desc);
create unique index if not exists idx_paiements_vente_reference
    on paiements_vente(fournisseur, reference_fournisseur) where reference_fournisseur is not null;

alter table paiements_vente enable row level security;
drop policy if exists "lecture_paiements_vente" on paiements_vente;
create policy "lecture_paiements_vente" on paiements_vente
    for select to authenticated
    using (entreprise_id = entreprise_de_l_utilisateur_connecte());
revoke insert, update, delete on paiements_vente from anon, authenticated;

alter table ventes add column if not exists paiement_vente_id uuid unique
    references paiements_vente(id) on delete set null;

-- ---------------------------------------------------------------------
-- 3. SYNCHRONISATION D'UNE VENTE : + p_paiement_id
--    (reprise de migration_hors_ligne.sql ; l'ancienne signature à 9
--    paramètres est remplacée : les appels existants restent valides
--    grâce à la valeur par défaut)
-- ---------------------------------------------------------------------
drop function if exists synchroniser_vente(uuid, timestamptz, uuid, uuid, uuid, uuid, text, jsonb, text);

create or replace function synchroniser_vente(
    p_id_local       uuid,
    p_vendu_le       timestamptz,
    p_appareil_id    uuid,
    p_entreprise_id  uuid,
    p_client_id      uuid,
    p_utilisateur_id uuid,
    p_mode_paiement  text,
    p_lignes         jsonb,
    p_type_facture   text default 'simple',
    p_paiement_id    uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_u         uuid := verifier_acces_entreprise(p_entreprise_id);
    v_existante ventes%rowtype;
    v_paiement  paiements_vente%rowtype;
    v_vente_id  uuid;
    v_total     numeric;
    v_date      timestamptz;
    v_der       date;
    v_tz        text;
    v_tardive   boolean := false;
begin
    if p_id_local is null then
        raise exception 'Identifiant local manquant.';
    end if;

    perform verifier_reference('clients', p_client_id, p_entreprise_id);
    perform verifier_articles_lignes(p_lignes, p_entreprise_id);

    -- Un seul traitement à la fois par entreprise (stock, numérotation,
    -- et deux envois simultanés de la même vente).
    perform pg_advisory_xact_lock(hashtext('vente_' || p_entreprise_id::text));

    select * into v_existante from ventes where entreprise_id = p_entreprise_id and id_local = p_id_local;
    if found then
        return jsonb_build_object('vente_id', v_existante.id, 'numero_vente', v_existante.numero_vente,
                                  'deja_recue', true, 'saisie_tardive', v_existante.saisie_tardive);
    end if;

    -- Paiement électronique : vérifié AVANT de créer quoi que ce soit.
    if p_paiement_id is not null then
        if p_mode_paiement <> 'mobile_money' then
            raise exception 'Un paiement électronique ne peut être rattaché qu''à une vente Mobile Money.';
        end if;
        select * into v_paiement from paiements_vente where id = p_paiement_id for update;
        if not found or v_paiement.entreprise_id <> p_entreprise_id then
            raise exception 'Paiement électronique introuvable.';
        end if;
        if v_paiement.statut <> 'reussi' then
            raise exception 'Le paiement Mobile Money n''est pas confirmé (statut : %).', v_paiement.statut;
        end if;
        if v_paiement.vente_id is not null then
            raise exception 'Ce paiement Mobile Money a déjà été utilisé pour une autre vente.';
        end if;
    end if;

    -- Heure réelle : jamais dans le futur (horloge d'appareil déréglée).
    v_date := least(coalesce(p_vendu_le, now()), now());

    select derniere_journee_cloturee, coalesce(fuseau_horaire, 'Africa/Porto-Novo') into v_der, v_tz
    from entreprises where id = p_entreprise_id;
    if v_der is not null and (v_date at time zone v_tz)::date <= v_der then
        v_date := now();
        v_tardive := true;
    end if;

    v_vente_id := _interne_creer_vente(p_entreprise_id, p_client_id, coalesce(v_u, p_utilisateur_id),
                                       p_mode_paiement, p_lignes, coalesce(p_type_facture, 'simple'));

    if p_paiement_id is not null then
        select montant_total into v_total from ventes where id = v_vente_id;
        if v_total > v_paiement.montant then
            -- Annule toute la transaction (vente, stock, facture).
            raise exception 'Le montant payé (% F) est inférieur au total de la vente (% F).',
                v_paiement.montant, round(v_total);
        end if;
        update paiements_vente set vente_id = v_vente_id, mis_a_jour_le = now() where id = p_paiement_id;
    end if;

    update ventes
        set id_local = p_id_local,
            vendu_le = coalesce(p_vendu_le, now()),
            appareil_id = p_appareil_id,
            saisie_tardive = v_tardive,
            created_at = v_date,
            paiement_vente_id = p_paiement_id
        where id = v_vente_id;

    update mouvements_stock set created_at = v_date
        where reference_document = v_vente_id and entreprise_id = p_entreprise_id;

    return jsonb_build_object(
        'vente_id', v_vente_id,
        'numero_vente', (select numero_vente from ventes where id = v_vente_id),
        'deja_recue', false,
        'saisie_tardive', v_tardive
    );
end;
$$;

revoke all on function synchroniser_vente(uuid, timestamptz, uuid, uuid, uuid, uuid, text, jsonb, text, uuid) from public, anon;
grant execute on function synchroniser_vente(uuid, timestamptz, uuid, uuid, uuid, uuid, text, jsonb, text, uuid) to authenticated;
