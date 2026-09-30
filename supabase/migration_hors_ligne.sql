-- =====================================================================
-- MIGRATION : VENTES HORS LIGNE FIABLES (plusieurs appareils)
-- À exécuter après migration_isolation_entreprises.sql.
--
--   1. Anti-doublon : chaque vente reçoit sur l'appareil un identifiant
--      unique (id_local). Si elle est renvoyée (réseau coupé pendant la
--      réponse), le serveur la reconnaît et ne la crée pas deux fois.
--   2. Heure réelle : la vente est datée du moment où elle a été faite
--      sur l'appareil, pas du moment de la synchronisation.
--   3. Une vente hors ligne n'est JAMAIS refusée pour une journée déjà
--      clôturée : elle est reportée sur la journée ouverte et marquée
--      « saisie tardive » (heure réelle conservée) pour que le gérant
--      la voie.
--   4. Suivi des appareils : chaque appareil signale sa dernière
--      synchronisation et le nombre d'opérations en attente, pour que le
--      gérant sache, avant de clôturer, qui n'a pas encore synchronisé.
--   5. Verrou par entreprise sur la création des ventes : deux appareils
--      qui synchronisent en même temps ne peuvent plus perdre une
--      déduction de stock ni obtenir le même numéro de vente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. COLONNES VENTES
-- ---------------------------------------------------------------------
alter table ventes add column if not exists id_local        uuid;
alter table ventes add column if not exists vendu_le        timestamptz;
alter table ventes add column if not exists appareil_id     uuid;
alter table ventes add column if not exists saisie_tardive  boolean not null default false;

create unique index if not exists uq_ventes_id_local
    on ventes(entreprise_id, id_local)
    where id_local is not null;

-- ---------------------------------------------------------------------
-- 2. APPAREILS
-- ---------------------------------------------------------------------
create table if not exists appareils (
    id                      uuid primary key,      -- généré sur l'appareil
    entreprise_id           uuid not null references entreprises(id) on delete cascade,
    utilisateur_id          uuid references utilisateurs(id) on delete set null,
    libelle                 text not null default 'Appareil',
    operations_en_attente   integer not null default 0 check (operations_en_attente >= 0),
    derniere_synchro        timestamptz not null default now(),
    created_at              timestamptz not null default now()
);

create index if not exists idx_appareils_entreprise on appareils(entreprise_id, derniere_synchro desc);

alter table appareils enable row level security;

drop policy if exists "lecture_appareils" on appareils;
create policy "lecture_appareils"
    on appareils for select
    using (entreprise_id = entreprise_de_l_utilisateur_connecte());
-- Écriture uniquement via signaler_appareil().

create or replace function signaler_appareil(p_appareil_id uuid, p_libelle text, p_en_attente integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id  uuid;
    v_ent uuid;
begin
    select id, entreprise_id into v_id, v_ent from utilisateurs where auth_user_id = auth.uid() and actif;
    if v_id is null then
        raise exception 'Accès refusé.' using errcode = '42501';
    end if;
    if p_appareil_id is null then
        raise exception 'Appareil invalide.';
    end if;

    insert into appareils (id, entreprise_id, utilisateur_id, libelle, operations_en_attente, derniere_synchro)
    values (p_appareil_id, v_ent, v_id, left(coalesce(nullif(btrim(p_libelle), ''), 'Appareil'), 60),
            greatest(coalesce(p_en_attente, 0), 0), now())
    on conflict (id) do update
        set utilisateur_id        = excluded.utilisateur_id,
            libelle               = excluded.libelle,
            operations_en_attente = excluded.operations_en_attente,
            derniere_synchro      = now()
        -- Un identifiant d'appareil ne peut pas être « volé » par une
        -- autre entreprise.
        where appareils.entreprise_id = excluded.entreprise_id;
end;
$$;

-- Appareils actifs susceptibles d'avoir des ventes non synchronisées
-- pour la journée p_date : opérations en attente signalées, ou dernier
-- contact antérieur à la fin de cette journée.
create or replace function appareils_a_synchroniser(p_date date)
returns table (
    appareil_id             uuid,
    libelle                 text,
    utilisateur             text,
    operations_en_attente   integer,
    derniere_synchro        timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_ent    uuid := entreprise_de_l_utilisateur_connecte();
    v_fin    timestamptz;
begin
    if v_ent is null or niveau_acces_clotures() = 'aucun' then
        raise exception 'Accès refusé.' using errcode = '42501';
    end if;
    v_fin := (p_date + 1)::timestamp at time zone fuseau_entreprise(v_ent);

    return query
    select a.id, a.libelle, u.nom, a.operations_en_attente, a.derniere_synchro
    from appareils a
    left join utilisateurs u on u.id = a.utilisateur_id
    where a.entreprise_id = v_ent
      and a.derniere_synchro > now() - interval '14 days'
      and (a.operations_en_attente > 0 or a.derniere_synchro < v_fin)
      -- Appareils ayant déjà vendu sur la période récente (les appareils
      -- de consultation seule ne bloquent personne).
      and exists (select 1 from ventes v where v.appareil_id = a.id and v.created_at > now() - interval '14 days')
    order by a.derniere_synchro;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. VERROU ANTI-COURSE SUR LES VENTES
-- Recréation des enveloppes de migration_isolation_entreprises.sql avec
-- un verrou par entreprise : les ventes d'une même entreprise sont
-- créées l'une après l'autre (stock et numérotation cohérents).
-- ---------------------------------------------------------------------
create or replace function creer_vente(
    p_entreprise_id uuid, p_client_id uuid, p_utilisateur_id uuid, p_mode_paiement text, p_lignes jsonb,
    p_type_facture text default 'simple'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_u uuid := verifier_acces_entreprise(p_entreprise_id);
begin
    perform verifier_reference('clients', p_client_id, p_entreprise_id);
    perform verifier_articles_lignes(p_lignes, p_entreprise_id);
    perform pg_advisory_xact_lock(hashtext('vente_' || p_entreprise_id::text));
    return _interne_creer_vente(p_entreprise_id, p_client_id, coalesce(v_u, p_utilisateur_id),
                                p_mode_paiement, p_lignes, p_type_facture);
end;
$$;

create or replace function creer_vente(
    p_entreprise_id uuid, p_client_id uuid, p_utilisateur_id uuid, p_mode_paiement text, p_lignes jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_u uuid := verifier_acces_entreprise(p_entreprise_id);
begin
    perform verifier_reference('clients', p_client_id, p_entreprise_id);
    perform verifier_articles_lignes(p_lignes, p_entreprise_id);
    perform pg_advisory_xact_lock(hashtext('vente_' || p_entreprise_id::text));
    return _interne_creer_vente(p_entreprise_id, p_client_id, coalesce(v_u, p_utilisateur_id),
                                p_mode_paiement, p_lignes);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. SYNCHRONISATION D'UNE VENTE (en ligne comme hors ligne)
-- ---------------------------------------------------------------------
create or replace function synchroniser_vente(
    p_id_local       uuid,
    p_vendu_le       timestamptz,
    p_appareil_id    uuid,
    p_entreprise_id  uuid,
    p_client_id      uuid,
    p_utilisateur_id uuid,
    p_mode_paiement  text,
    p_lignes         jsonb,
    p_type_facture   text default 'simple'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_u         uuid := verifier_acces_entreprise(p_entreprise_id);
    v_existante ventes%rowtype;
    v_vente_id  uuid;
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

    -- Heure réelle : jamais dans le futur (horloge d'appareil déréglée).
    v_date := least(coalesce(p_vendu_le, now()), now());

    select derniere_journee_cloturee, coalesce(fuseau_horaire, 'Africa/Porto-Novo') into v_der, v_tz
    from entreprises where id = p_entreprise_id;
    if v_der is not null and (v_date at time zone v_tz)::date <= v_der then
        -- Journée déjà clôturée : on ne perd pas la vente, on la reporte
        -- sur la journée ouverte en conservant l'heure réelle.
        v_date := now();
        v_tardive := true;
    end if;

    v_vente_id := _interne_creer_vente(p_entreprise_id, p_client_id, coalesce(v_u, p_utilisateur_id),
                                       p_mode_paiement, p_lignes, coalesce(p_type_facture, 'simple'));

    update ventes
        set id_local = p_id_local,
            vendu_le = coalesce(p_vendu_le, now()),
            appareil_id = p_appareil_id,
            saisie_tardive = v_tardive,
            created_at = v_date
        where id = v_vente_id;

    -- Mouvements de stock alignés sur l'heure réelle de la vente.
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

revoke all on function signaler_appareil(uuid, text, integer) from public, anon;
revoke all on function appareils_a_synchroniser(date) from public, anon;
revoke all on function synchroniser_vente(uuid, timestamptz, uuid, uuid, uuid, uuid, text, jsonb, text) from public, anon;
revoke all on function creer_vente(uuid,uuid,uuid,text,jsonb,text) from public, anon;
revoke all on function creer_vente(uuid,uuid,uuid,text,jsonb) from public, anon;
grant execute on function signaler_appareil(uuid, text, integer) to authenticated;
grant execute on function appareils_a_synchroniser(date) to authenticated;
grant execute on function synchroniser_vente(uuid, timestamptz, uuid, uuid, uuid, uuid, text, jsonb, text) to authenticated;
grant execute on function creer_vente(uuid,uuid,uuid,text,jsonb,text) to authenticated;
grant execute on function creer_vente(uuid,uuid,uuid,text,jsonb) to authenticated;
