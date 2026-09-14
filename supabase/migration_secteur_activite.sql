-- =====================================================================
-- MIGRATION : SECTEUR D'ACTIVITE DE L'ENTREPRISE
-- À exécuter après migration_depot_boissons.sql, en une fois dans le
-- SQL Editor de Supabase.
--
-- Permet de choisir un secteur d'activité à l'inscription
-- (quincaillerie, dépôt de boissons, alimentation générale, pièces
-- détachées, autre) afin d'adapter les modules affichés dans la
-- navigation. Les secteurs "alimentation_generale", "pieces_detachees"
-- et "autre" n'ont pas encore de modules dédiés : ils voient les
-- modules de base (vente, stock, clients, factures...) en attendant.
-- =====================================================================

alter table entreprises
    add column if not exists secteur_activite text not null default 'autre'
    check (secteur_activite in
        ('quincaillerie', 'depot_boissons', 'alimentation_generale', 'pieces_detachees', 'autre')),
    add column if not exists secteur_activite_autre text;

-- ---------------------------------------------------------------------
-- Met à jour la fonction d'inscription self-service pour accepter le
-- secteur d'activité choisi (remplace la version de migration_phase2.sql).
-- ---------------------------------------------------------------------
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
as $$
declare
    v_entreprise_id uuid;
    v_uid uuid := auth.uid();
begin
    if v_uid is null then
        raise exception 'Utilisateur non authentifié.';
    end if;

    if exists (select 1 from utilisateurs where auth_user_id = v_uid) then
        raise exception 'Ce compte est déjà associé à une entreprise.';
    end if;

    if coalesce(p_secteur_activite, 'autre') not in
        ('quincaillerie', 'depot_boissons', 'alimentation_generale', 'pieces_detachees', 'autre') then
        raise exception 'Secteur d''activité invalide : %', p_secteur_activite;
    end if;

    insert into entreprises (nom, regime_fiscal, telephone, secteur_activite, secteur_activite_autre)
    values (
        p_nom_entreprise,
        coalesce(p_regime_fiscal, 'forfait'),
        p_telephone,
        coalesce(p_secteur_activite, 'autre'),
        case when p_secteur_activite = 'autre' then p_secteur_activite_autre else null end
    )
    returning id into v_entreprise_id;

    insert into utilisateurs (entreprise_id, auth_user_id, nom, role)
    values (v_entreprise_id, v_uid, p_nom_gerant, 'gerant');

    return v_entreprise_id;
end;
$$;
