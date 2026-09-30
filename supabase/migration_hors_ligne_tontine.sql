-- =====================================================================
-- MIGRATION : CLIENTS ET TONTINE HORS LIGNE (étape 2)
-- À exécuter après migration_hors_ligne.sql.
--
--   1. Cotisations : identifiant unique créé sur l'appareil (id_local),
--      heure réelle du versement, jamais de doublon, jamais perdues
--      (report sur la journée ouverte si la journée est clôturée).
--   2. Clients et tontines : leur identifiant est généré sur l'appareil ;
--      l'envoi est idempotent (renvoyer le même client ne crée pas de
--      doublon). Aucune nouvelle fonction nécessaire : insertion avec
--      « ne rien faire si l'identifiant existe déjà », sous la RLS.
--   3. Contrôle ajouté : une tontine ne peut être ouverte que pour un
--      client de la même entreprise.
--   4. Les appareils ayant encaissé des cotisations sont suivis avant
--      la clôture, comme ceux ayant vendu.
-- =====================================================================

alter table cotisations_tontine add column if not exists id_local        uuid;
alter table cotisations_tontine add column if not exists verse_le        timestamptz;
alter table cotisations_tontine add column if not exists appareil_id     uuid;
alter table cotisations_tontine add column if not exists saisie_tardive  boolean not null default false;

create unique index if not exists uq_cotisations_id_local
    on cotisations_tontine(entreprise_id, id_local)
    where id_local is not null;

-- ---------------------------------------------------------------------
-- Tontine : le client doit appartenir à la même entreprise
-- ---------------------------------------------------------------------
create or replace function verifier_client_tontine()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if not exists (select 1 from clients where id = new.client_id and entreprise_id = new.entreprise_id) then
        raise exception 'Client introuvable dans ton entreprise.' using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_verifier_client_tontine on tontines;
create trigger trg_verifier_client_tontine
    before insert or update of client_id, entreprise_id on tontines
    for each row execute function verifier_client_tontine();

revoke all on function verifier_client_tontine() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Synchronisation d'une cotisation
-- ---------------------------------------------------------------------
create or replace function synchroniser_cotisation(
    p_id_local       uuid,
    p_verse_le       timestamptz,
    p_appareil_id    uuid,
    p_tontine_id     uuid,
    p_entreprise_id  uuid,
    p_montant        numeric,
    p_mode_paiement  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_existante  cotisations_tontine%rowtype;
    v_id         uuid;
    v_date       timestamptz;
    v_der        date;
    v_tz         text;
    v_tardive    boolean := false;
    v_tontine    tontines%rowtype;
begin
    perform verifier_acces_entreprise(p_entreprise_id);
    if p_id_local is null then
        raise exception 'Identifiant local manquant.';
    end if;

    -- Même verrou que la numérotation des reçus : un seul traitement à
    -- la fois par entreprise (et deux envois simultanés de la même
    -- cotisation ne peuvent pas passer tous les deux).
    perform pg_advisory_xact_lock(hashtext('recu_tontine_' || p_entreprise_id::text));

    select * into v_existante from cotisations_tontine
    where entreprise_id = p_entreprise_id and id_local = p_id_local;
    if found then
        select * into v_tontine from tontines where id = v_existante.tontine_id;
        return jsonb_build_object(
            'cotisation_id', v_existante.id, 'numero_recu', v_existante.numero_recu,
            'deja_recue', true, 'saisie_tardive', v_existante.saisie_tardive,
            'montant_cumule', v_tontine.montant_cumule, 'statut', v_tontine.statut);
    end if;

    v_date := least(coalesce(p_verse_le, now()), now());
    select derniere_journee_cloturee, coalesce(fuseau_horaire, 'Africa/Porto-Novo') into v_der, v_tz
    from entreprises where id = p_entreprise_id;
    if v_der is not null and (v_date at time zone v_tz)::date <= v_der then
        v_date := now();
        v_tardive := true;
    end if;

    -- Contrôles (tontine de l'entreprise, non clôturée, montant) et mise
    -- à jour du cumul : dans la fonction existante.
    v_id := enregistrer_cotisation_tontine(p_tontine_id, p_entreprise_id, p_montant, p_mode_paiement, null);

    update cotisations_tontine
        set id_local = p_id_local,
            verse_le = coalesce(p_verse_le, now()),
            appareil_id = p_appareil_id,
            saisie_tardive = v_tardive,
            created_at = v_date
        where id = v_id;

    select * into v_tontine from tontines where id = p_tontine_id;
    return jsonb_build_object(
        'cotisation_id', v_id,
        'numero_recu', (select numero_recu from cotisations_tontine where id = v_id),
        'deja_recue', false,
        'saisie_tardive', v_tardive,
        'montant_cumule', v_tontine.montant_cumule,
        'statut', v_tontine.statut);
end;
$$;

revoke all on function synchroniser_cotisation(uuid, timestamptz, uuid, uuid, uuid, numeric, text) from public, anon;
grant execute on function synchroniser_cotisation(uuid, timestamptz, uuid, uuid, uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- Suivi des appareils avant clôture : ventes OU cotisations
-- ---------------------------------------------------------------------
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
      and (
          exists (select 1 from ventes v where v.appareil_id = a.id and v.created_at > now() - interval '14 days')
          or exists (select 1 from cotisations_tontine c where c.appareil_id = a.id and c.created_at > now() - interval '14 days')
      )
    order by a.derniere_synchro;
end;
$$;
