-- =====================================================================
-- MIGRATION : SECTEUR D'ACTIVITÉ + FOURNISSEURS + GROS/DEMI-GROS + LIVRAISON
-- À exécuter après migration_type_facture.sql.
--
-- Le SaaS devient multi-secteurs : une entreprise choisit son secteur
-- à l'inscription. Ce chantier construit les modules du secteur
-- "quincaillerie" (fournisseurs, tarifs gros/demi-gros, livraison).
-- Le secteur "depot_boissons" est ajouté comme option dès maintenant,
-- ses écrans dédiés (casiers, consignes, casse) viendront au prochain
-- chantier.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. SECTEUR D'ACTIVITÉ
-- ---------------------------------------------------------------------
alter table entreprises
    add column if not exists secteur_activite text
    not null default 'quincaillerie'
    check (secteur_activite in ('quincaillerie', 'depot_boissons'));

-- ---------------------------------------------------------------------
-- 2. FOURNISSEURS
-- ---------------------------------------------------------------------
create table if not exists fournisseurs (
    id            uuid primary key default gen_random_uuid(),
    entreprise_id uuid not null references entreprises(id) on delete cascade,
    nom           text not null,
    telephone     text,
    adresse       text,
    ifu           text,
    actif         boolean not null default true,
    created_at    timestamptz not null default now()
);

create index if not exists idx_fournisseurs_entreprise on fournisseurs(entreprise_id);

alter table fournisseurs enable row level security;

create policy "isolation_par_entreprise_fournisseurs"
    on fournisseurs
    for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

-- Lien optionnel entre un article et son fournisseur habituel, et
-- traçabilité du fournisseur sur chaque entrée de stock.
alter table articles
    add column if not exists fournisseur_id uuid references fournisseurs(id) on delete set null;

alter table mouvements_stock
    add column if not exists fournisseur_id uuid references fournisseurs(id) on delete set null;

-- ---------------------------------------------------------------------
-- 3. TARIFS GROS / DEMI-GROS
-- prix_vente (déjà existant) reste le tarif détail.
-- ---------------------------------------------------------------------
alter table articles
    add column if not exists prix_gros numeric(12,2),
    add column if not exists prix_demi_gros numeric(12,2);

alter table ventes
    add column if not exists type_vente text
    not null default 'detail'
    check (type_vente in ('detail', 'demi_gros', 'gros'));

-- ---------------------------------------------------------------------
-- 4. LIVRAISONS
-- ---------------------------------------------------------------------
create table if not exists livraisons (
    id                uuid primary key default gen_random_uuid(),
    entreprise_id     uuid not null references entreprises(id) on delete cascade,
    vente_id          uuid not null references ventes(id) on delete cascade,
    client_id         uuid references clients(id) on delete set null,
    adresse_livraison text not null,
    date_prevue       date,
    date_livraison    timestamptz,
    statut            text not null default 'en_attente'
                      check (statut in ('en_attente', 'en_cours', 'livree', 'annulee')),
    notes             text,
    created_at        timestamptz not null default now()
);

create index if not exists idx_livraisons_entreprise on livraisons(entreprise_id);
create index if not exists idx_livraisons_statut on livraisons(entreprise_id, statut);

alter table livraisons enable row level security;

create policy "isolation_par_entreprise_livraisons"
    on livraisons
    for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

-- ---------------------------------------------------------------------
-- 5. creer_vente — nouvelle version avec type de vente et livraison
-- optionnelle, toujours atomique.
-- ---------------------------------------------------------------------
drop function if exists creer_vente(uuid, uuid, uuid, text, jsonb, text);

create or replace function creer_vente(
    p_entreprise_id  uuid,
    p_client_id      uuid,
    p_utilisateur_id uuid,
    p_mode_paiement  text,
    p_lignes         jsonb,
    p_type_facture   text default 'simple',
    p_type_vente     text default 'detail',
    p_livraison      jsonb default null  -- {adresse, date_prevue} ou null
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
    if p_type_vente not in ('detail', 'demi_gros', 'gros') then
        p_type_vente := 'detail';
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
        montant_total, montant_paye, mode_paiement, statut, type_vente
    )
    values (
        p_entreprise_id, v_numero_vente, p_client_id, p_utilisateur_id,
        v_total,
        case when p_mode_paiement = 'credit' then 0 else v_total end,
        p_mode_paiement,
        case when p_mode_paiement = 'credit' then 'creance' else 'payee' end,
        p_type_vente
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

    v_statut_emecef := case when p_type_facture = 'normalisee' then 'en_attente' else 'non_applicable' end;

    insert into factures (entreprise_id, vente_id, type_facture, numero_facture, statut_emecef)
    values (
        p_entreprise_id, v_vente_id, p_type_facture,
        (case when p_type_facture = 'normalisee' then 'FN-' else 'F-' end) || v_numero_vente,
        v_statut_emecef
    );

    if p_livraison is not null then
        insert into livraisons (entreprise_id, vente_id, client_id, adresse_livraison, date_prevue)
        values (
            p_entreprise_id, v_vente_id, p_client_id,
            p_livraison->>'adresse',
            nullif(p_livraison->>'date_prevue', '')::date
        );
    end if;

    return v_vente_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Réception atomique d'une livraison fournisseur (entrées de stock
-- groupées, comme demarrer_inventaire).
-- ---------------------------------------------------------------------
create or replace function receptionner_livraison_fournisseur(
    p_entreprise_id  uuid,
    p_fournisseur_id uuid,
    p_utilisateur_id uuid,
    p_lignes         jsonb  -- [{article_id, quantite}]
)
returns void
language plpgsql
security definer
as $$
declare
    v_ligne       jsonb;
    v_article_id  uuid;
    v_quantite    numeric;
    v_stock_avant numeric;
    v_stock_apres numeric;
begin
    for v_ligne in select * from jsonb_array_elements(p_lignes)
    loop
        v_article_id := (v_ligne->>'article_id')::uuid;
        v_quantite   := (v_ligne->>'quantite')::numeric;

        select stock_actuel into v_stock_avant from articles where id = v_article_id;
        v_stock_apres := v_stock_avant + v_quantite;

        insert into mouvements_stock (
            entreprise_id, article_id, type_mouvement,
            quantite, quantite_avant, quantite_apres,
            motif, fournisseur_id, utilisateur_id
        )
        values (
            p_entreprise_id, v_article_id, 'entree',
            v_quantite, v_stock_avant, v_stock_apres,
            'Réception fournisseur', p_fournisseur_id, p_utilisateur_id
        );

        update articles
            set stock_actuel = v_stock_apres, updated_at = now()
            where id = v_article_id;
    end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Inscription : accepter le secteur d'activité choisi
-- ---------------------------------------------------------------------
drop function if exists creer_entreprise_et_gerant(text, text, text, text);

create or replace function creer_entreprise_et_gerant(
    p_nom_entreprise    text,
    p_regime_fiscal     text,
    p_telephone         text,
    p_nom_gerant        text,
    p_secteur_activite  text default 'quincaillerie'
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

    if p_secteur_activite not in ('quincaillerie', 'depot_boissons') then
        p_secteur_activite := 'quincaillerie';
    end if;

    insert into entreprises (nom, regime_fiscal, telephone, secteur_activite)
    values (p_nom_entreprise, coalesce(p_regime_fiscal, 'forfait'), p_telephone, p_secteur_activite)
    returning id into v_entreprise_id;

    insert into utilisateurs (entreprise_id, auth_user_id, nom, role)
    values (v_entreprise_id, v_uid, p_nom_gerant, 'gerant');

    return v_entreprise_id;
end;
$$;
