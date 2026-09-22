-- =====================================================================
-- MIGRATION : LEDGER DES CRÉANCES CLIENTS
-- À exécuter après migration_role_magasinier.sql.
--
-- Jusqu'ici, `clients.solde_credit` était un simple compteur, modifié
-- directement par deux chemins différents (creer_vente et un update
-- client-side dans enregistrerPaiementClient), sans aucune trace de
-- CE QUI a fait varier le solde ni QUI l'a modifié. Cette migration
-- introduit `mouvements_creance` : chaque variation du solde d'un
-- client (vente à crédit, paiement reçu, avoir, ajustement manuel)
-- devient une écriture datée, signée, tracée, avec le solde résultant
-- figé au moment de l'écriture (comme un vrai grand livre comptable).
--
-- `clients.solde_credit` reste en place comme cache rapide (tout le
-- reste de l'app le lit encore), mais n'est plus modifiable QUE via la
-- fonction RPC `enregistrer_mouvement_creance`, qui est désormais
-- l'unique porte d'entrée — plus aucun update direct ailleurs.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLE DU LEDGER
-- montant est SIGNÉ : positif = augmente ce que le client doit,
-- négatif = le diminue. solde_apres fige le solde du client
-- immédiatement après cette écriture (lecture rapide de l'historique
-- sans avoir à ressommer toutes les lignes).
-- ---------------------------------------------------------------------
create table if not exists mouvements_creance (
    id                  uuid primary key default gen_random_uuid(),
    entreprise_id       uuid not null references entreprises(id) on delete cascade,
    client_id           uuid not null references clients(id) on delete cascade,
    type_mouvement      text not null
                        check (type_mouvement in ('vente_credit', 'paiement', 'avoir', 'ajustement')),
    montant             numeric(12,2) not null,
    solde_apres         numeric(12,2) not null,
    reference_vente_id  uuid references ventes(id) on delete set null,
    reference_avoir_id  uuid, -- FK ajoutée dans migration_annulation_avoir.sql (table pas encore créée ici)
    motif               text,
    utilisateur_id      uuid references utilisateurs(id),
    created_at          timestamptz not null default now()
);

create index if not exists idx_mouvements_creance_entreprise on mouvements_creance(entreprise_id);
create index if not exists idx_mouvements_creance_client on mouvements_creance(client_id, created_at);

alter table mouvements_creance enable row level security;

create policy "isolation_par_entreprise_mouvements_creance"
    on mouvements_creance for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

-- ---------------------------------------------------------------------
-- 2. FONCTION RPC : enregistrer_mouvement_creance
-- Point d'entrée UNIQUE pour toute variation du solde d'un client.
-- Verrouille la ligne client (for update) le temps de la transaction
-- pour éviter qu'un paiement et une vente à crédit simultanés ne se
-- marchent dessus et produisent un solde_apres incohérent.
-- Le solde reste plancher à 0 (comme le comportement précédent) :
-- un avoir qui dépasserait la dette du client sera capé, la différence
-- reste visible dans l'écriture elle-même (montant) même si solde_apres
-- ne descend pas sous 0.
-- =====================================================================
create or replace function enregistrer_mouvement_creance(
    p_entreprise_id         uuid,
    p_client_id             uuid,
    p_type_mouvement        text,
    p_montant               numeric, -- signé
    p_reference_vente_id    uuid,
    p_reference_avoir_id    uuid,
    p_motif                 text,
    p_utilisateur_id        uuid
)
returns uuid
language plpgsql
security definer
as $$
declare
    v_solde_actuel  numeric;
    v_nouveau_solde numeric;
    v_mouvement_id  uuid;
begin
    select solde_credit into v_solde_actuel
    from clients where id = p_client_id and entreprise_id = p_entreprise_id
    for update;

    if v_solde_actuel is null then
        raise exception 'Client introuvable.';
    end if;

    v_nouveau_solde := greatest(0, v_solde_actuel + p_montant);

    insert into mouvements_creance (
        entreprise_id, client_id, type_mouvement, montant, solde_apres,
        reference_vente_id, reference_avoir_id, motif, utilisateur_id
    )
    values (
        p_entreprise_id, p_client_id, p_type_mouvement, p_montant, v_nouveau_solde,
        p_reference_vente_id, p_reference_avoir_id, p_motif, p_utilisateur_id
    )
    returning id into v_mouvement_id;

    update clients set solde_credit = v_nouveau_solde where id = p_client_id;

    return v_mouvement_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. FONCTION RPC : enregistrer_paiement_client
-- Remplace la logique client-side en deux étapes (non atomique) de
-- enregistrerPaiementClient. Garde une trace dans `paiements` (table
-- existante, compatibilité) EN PLUS de l'écriture dans le ledger.
-- =====================================================================
create or replace function enregistrer_paiement_client(
    p_entreprise_id     uuid,
    p_client_id         uuid,
    p_montant           numeric,
    p_mode_paiement     text,
    p_utilisateur_id    uuid
)
returns uuid
language plpgsql
security definer
as $$
declare
    v_mouvement_id uuid;
begin
    if p_montant <= 0 then
        raise exception 'Le montant du paiement doit être positif.';
    end if;

    insert into paiements (entreprise_id, client_id, montant, mode_paiement)
    values (p_entreprise_id, p_client_id, p_montant, p_mode_paiement);

    v_mouvement_id := enregistrer_mouvement_creance(
        p_entreprise_id, p_client_id, 'paiement', -p_montant,
        null, null, 'Paiement reçu', p_utilisateur_id
    );

    return v_mouvement_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. MISE À JOUR DE creer_vente
-- Remplace l'update direct de solde_credit par un passage dans le
-- ledger (traçabilité complète des ventes à crédit dès leur création).
-- Conserve intégralement ce qu'avait ajouté migration_type_facture.sql
-- (paramètre p_type_facture, statut e-MECeF) : cette fonction reprend
-- sa version la plus récente à date, pas la version de base de
-- schema.sql — ne JAMAIS repartir de schema.sql seul pour un
-- create or replace sur cette fonction.
-- ---------------------------------------------------------------------
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

    -- Créance client si vente à crédit — passe désormais par le ledger
    -- (au lieu du simple `update clients set solde_credit = ...`).
    if p_mode_paiement = 'credit' and p_client_id is not null then
        perform enregistrer_mouvement_creance(
            p_entreprise_id, p_client_id, 'vente_credit', v_total,
            v_vente_id, null, 'Vente à crédit ' || v_numero_vente, p_utilisateur_id
        );
    end if;

    -- 'en_attente' pour une facture normalisée : en attente de
    -- transmission à e-MECeF. 'non_applicable' pour une facture simple.
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
-- 5. BACKFILL : ouverture du ledger pour les soldes déjà existants
-- Pour que le ledger et le solde en cache reconcilient dès le départ,
-- chaque client ayant déjà un solde_credit > 0 reçoit une écriture
-- d'ouverture de type "ajustement" à la date d'aujourd'hui.
-- ---------------------------------------------------------------------
do $$
declare
    v_client record;
begin
    for v_client in
        select id, entreprise_id, solde_credit from clients where solde_credit > 0
    loop
        insert into mouvements_creance (
            entreprise_id, client_id, type_mouvement, montant, solde_apres, motif
        )
        values (
            v_client.entreprise_id, v_client.id, 'ajustement', v_client.solde_credit,
            v_client.solde_credit, 'Solde d''ouverture du ledger (migration)'
        );
    end loop;
end $$;
