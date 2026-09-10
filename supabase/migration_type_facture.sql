-- =====================================================================
-- MIGRATION : CHOIX LIBRE DU TYPE DE FACTURE
-- À exécuter après migration_momo.sql.
--
-- Objectif : le type de facture (simple ou normalisée) n'est plus lié
-- automatiquement au régime fiscal de l'entreprise. Le vendeur ou le
-- gérant choisit à chaque vente, et peut aussi convertir une facture
-- simple en normalisée après coup si un client le demande.
-- =====================================================================

-- On remplace creer_vente pour accepter le type de facture choisi.
create or replace function creer_vente(
    p_entreprise_id  uuid,
    p_client_id      uuid,
    p_utilisateur_id uuid,
    p_mode_paiement  text,
    p_lignes         jsonb,
    p_type_facture   text default 'simple'
)
returns uuid
language plpgsql
security definer
as $$
declare
    v_vente_id      uuid;
    v_numero_vente  text;
    v_total         numeric := 0;
    v_ligne         jsonb;
    v_article_id    uuid;
    v_quantite      numeric;
    v_prix_unitaire numeric;
    v_prix_achat    numeric;
    v_remise        numeric;
    v_montant_ligne numeric;
    v_stock_avant   numeric;
    v_stock_apres   numeric;
    v_statut_emecef text;
begin
    if p_type_facture not in ('simple', 'normalisee') then
        p_type_facture := 'simple';
    end if;

    select 'V-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((count(*) + 1)::text, 4, '0')
    into v_numero_vente
    from ventes
    where entreprise_id = p_entreprise_id
      and created_at::date = current_date;

    for v_ligne in select * from jsonb_array_elements(p_lignes)
    loop
        v_total := v_total
            + (v_ligne->>'quantite')::numeric * (v_ligne->>'prix_unitaire')::numeric
            - coalesce((v_ligne->>'remise')::numeric, 0);
    end loop;

    insert into ventes (
        entreprise_id, numero_vente, client_id, utilisateur_id,
        montant_total, montant_paye, mode_paiement, statut
    )
    values (
        p_entreprise_id, v_numero_vente, p_client_id, p_utilisateur_id,
        v_total,
        case when p_mode_paiement = 'credit' then 0 else v_total end,
        p_mode_paiement,
        case when p_mode_paiement = 'credit' then 'creance' else 'payee' end
    )
    returning id into v_vente_id;

    for v_ligne in select * from jsonb_array_elements(p_lignes)
    loop
        v_article_id    := (v_ligne->>'article_id')::uuid;
        v_quantite      := (v_ligne->>'quantite')::numeric;
        v_prix_unitaire := (v_ligne->>'prix_unitaire')::numeric;
        v_prix_achat    := (v_ligne->>'prix_achat_unitaire')::numeric;
        v_remise        := coalesce((v_ligne->>'remise')::numeric, 0);
        v_montant_ligne := v_quantite * v_prix_unitaire - v_remise;

        insert into lignes_vente (
            vente_id, article_id, quantite, prix_unitaire,
            prix_achat_unitaire, remise, montant_ligne
        )
        values (
            v_vente_id, v_article_id, v_quantite, v_prix_unitaire,
            v_prix_achat, v_remise, v_montant_ligne
        );

        select stock_actuel into v_stock_avant from articles where id = v_article_id;
        v_stock_apres := v_stock_avant - v_quantite;

        insert into mouvements_stock (
            entreprise_id, article_id, type_mouvement,
            quantite, quantite_avant, quantite_apres,
            reference_document, utilisateur_id
        )
        values (
            p_entreprise_id, v_article_id, 'sortie_vente',
            -v_quantite, v_stock_avant, v_stock_apres,
            v_vente_id, p_utilisateur_id
        );

        update articles
            set stock_actuel = v_stock_apres, updated_at = now()
            where id = v_article_id;
    end loop;

    if p_mode_paiement = 'credit' and p_client_id is not null then
        update clients set solde_credit = solde_credit + v_total
            where id = p_client_id;
    end if;

    -- 'en_attente' pour une facture normalisée : en attente de
    -- transmission à e-MECeF (voir note plus bas). 'non_applicable'
    -- pour une facture simple, qui n'a aucune démarche DGI à faire.
    v_statut_emecef := case when p_type_facture = 'normalisee' then 'en_attente' else 'non_applicable' end;

    insert into factures (entreprise_id, vente_id, type_facture, numero_facture, statut_emecef)
    values (
        p_entreprise_id, v_vente_id, p_type_facture,
        (case when p_type_facture = 'normalisee' then 'FN-' else 'F-' end) || v_numero_vente,
        v_statut_emecef
    );

    return v_vente_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Conversion d'une facture simple en normalisée après coup (le client
-- en fait la demande une fois la vente déjà enregistrée), ou l'inverse.
-- ---------------------------------------------------------------------
create or replace function changer_type_facture(
    p_facture_id   uuid,
    p_nouveau_type text
)
returns void
language plpgsql
security definer
as $$
declare
    v_entreprise_id uuid;
    v_numero_actuel text;
    v_prefixe_actuel text;
begin
    if p_nouveau_type not in ('simple', 'normalisee') then
        raise exception 'Type de facture invalide.';
    end if;

    select entreprise_id, numero_facture into v_entreprise_id, v_numero_actuel
        from factures where id = p_facture_id;

    if v_entreprise_id is null then
        raise exception 'Facture introuvable.';
    end if;

    -- Sécurité : seul un utilisateur de cette entreprise peut agir
    -- (les policies RLS classiques s'appliquent normalement à cette
    -- fonction puisqu'elle n'a pas besoin de contourner quoi que ce
    -- soit d'autre que la mise à jour elle-même).
    if entreprise_de_l_utilisateur_connecte() <> v_entreprise_id then
        raise exception 'Accès refusé.';
    end if;

    update factures
        set type_facture = p_nouveau_type,
            statut_emecef = case when p_nouveau_type = 'normalisee' then 'en_attente' else 'non_applicable' end
        where id = p_facture_id;
end;
$$;
