-- =====================================================================
-- MIGRATION : TABLEAU DE BORD DÉCISIONNEL AKWEO
-- À exécuter après migration_multi_activites.sql.
--
-- Calcule côté base (un seul aller-retour réseau) les indicateurs de
-- pilotage : CA net du mois, marge nette du mois, total des créances,
-- argent immobilisé en stock, ruptures, stock dormant. "Net" = ventes
-- moins avoirs émis ce mois (les avoirs réduisent le CA/marge du mois
-- où ils sont émis, pas celui de la vente d'origine — approche standard
-- de reconnaissance des retours).
-- =====================================================================

create or replace function tableau_decisionnel(
    p_entreprise_id     uuid,
    p_jours_dormant     integer default 60
)
returns table (
    ca_mois             numeric,
    marge_mois          numeric,
    total_creances      numeric,
    argent_immobilise   numeric,
    nombre_ruptures     integer,
    nombre_stock_dormant integer
)
language plpgsql
security definer
as $$
declare
    v_debut_mois        timestamptz := date_trunc('month', now());
    v_ca_ventes         numeric;
    v_ca_avoirs         numeric;
    v_marge_ventes      numeric;
    v_marge_avoirs      numeric;
begin
    select coalesce(sum(montant_total), 0) into v_ca_ventes
    from ventes
    where entreprise_id = p_entreprise_id
      and statut <> 'annulee'
      and created_at >= v_debut_mois;

    select coalesce(sum(montant_total), 0) into v_ca_avoirs
    from avoirs
    where entreprise_id = p_entreprise_id
      and created_at >= v_debut_mois;

    select coalesce(sum((lv.prix_unitaire - lv.prix_achat_unitaire) * lv.quantite), 0) into v_marge_ventes
    from lignes_vente lv
    join ventes v on v.id = lv.vente_id
    where v.entreprise_id = p_entreprise_id
      and v.statut <> 'annulee'
      and v.created_at >= v_debut_mois;

    select coalesce(sum((la.prix_unitaire - lv.prix_achat_unitaire) * la.quantite), 0) into v_marge_avoirs
    from lignes_avoir la
    join avoirs a on a.id = la.avoir_id
    join lignes_vente lv on lv.id = la.ligne_vente_id
    where a.entreprise_id = p_entreprise_id
      and a.created_at >= v_debut_mois;

    return query
    select
        v_ca_ventes - v_ca_avoirs,
        v_marge_ventes - v_marge_avoirs,
        (select coalesce(sum(solde_credit), 0) from clients where entreprise_id = p_entreprise_id),
        (select coalesce(sum(stock_actuel * prix_achat), 0) from articles
            where entreprise_id = p_entreprise_id and actif = true),
        (select count(*)::integer from articles
            where entreprise_id = p_entreprise_id and actif = true and stock_actuel <= 0),
        (select count(*)::integer from articles a
            where a.entreprise_id = p_entreprise_id and a.actif = true and a.stock_actuel > 0
              and not exists (
                  select 1 from mouvements_stock ms
                  where ms.article_id = a.id
                    and ms.type_mouvement = 'sortie_vente'
                    and ms.created_at >= now() - (p_jours_dormant || ' days')::interval
              ));
end;
$$;

-- =====================================================================
-- FONCTION RPC : lister_stock_dormant
-- Liste (pas juste le compte) des articles en stock dormant, pour
-- affichage sur le tableau de bord décisionnel.
-- =====================================================================
create or replace function lister_stock_dormant(
    p_entreprise_id     uuid,
    p_jours_dormant     integer default 60
)
returns setof articles
language sql
security definer
as $$
    select a.* from articles a
    where a.entreprise_id = p_entreprise_id and a.actif = true and a.stock_actuel > 0
      and not exists (
          select 1 from mouvements_stock ms
          where ms.article_id = a.id
            and ms.type_mouvement = 'sortie_vente'
            and ms.created_at >= now() - (p_jours_dormant || ' days')::interval
      )
    order by a.stock_actuel * a.prix_achat desc
    limit 50;
$$;
