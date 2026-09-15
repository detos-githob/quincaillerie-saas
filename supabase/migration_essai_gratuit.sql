-- =====================================================================
-- MIGRATION : ESSAI GRATUIT DE 7 JOURS À L'INSCRIPTION
-- À exécuter après migration_notification_inscription.sql.
--
-- Jusqu'ici, une entreprise nouvellement inscrite se retrouvait avec
-- date_expiration_abonnement = NULL, ce que l'app interprète comme un
-- abonnement "illimité". Cette migration fait démarrer chaque nouvelle
-- entreprise sur un essai gratuit de 7 jours à la place : le compteur
-- de jours restants apparaît dès l'inscription, et l'app la bascule
-- automatiquement en "expiré" au bout de 7 jours si elle n'est pas
-- passée sur un forfait payant entre-temps (voir AbonnementExpirePage).
--
-- N'affecte QUE les entreprises créées à partir de maintenant — les
-- entreprises déjà inscrites (actuellement "illimité") ne sont pas
-- modifiées par cette migration.
-- =====================================================================

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
        'essai',
        'mensuel',
        (current_date + interval '7 days')::date
    )
    returning id into v_entreprise_id;

    insert into utilisateurs (entreprise_id, auth_user_id, nom, role)
    values (v_entreprise_id, v_uid, p_nom_gerant, 'gerant');

    return v_entreprise_id;
end;
$$;
