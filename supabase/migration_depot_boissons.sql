-- =====================================================================
-- MIGRATION : DEPOT DE BOISSONS — CASIERS, CONSIGNES, RETOURS, CASSES
-- À exécuter après migration_fournisseurs.sql, en une fois dans le
-- SQL Editor de Supabase.
--
-- Principe : un article "boisson" peut être vendu en casiers (unite =
-- 'casier' ou 'demi-casier') ET exiger une consigne : le client paie un
-- dépôt de garantie sur le casier/les bouteilles, qu'il récupère quand
-- il ramène les vides. On trace donc, séparément du stock de
-- marchandise, un solde de consigne par client (ce qu'il doit encore
-- rendre en vide), alimenté par les sorties et diminué par les retours.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PARAMETRAGE CONSIGNE SUR LES ARTICLES
-- gestion_consigne = false par défaut : n'affecte en rien les articles
-- d'une quincaillerie classique. capacite_casier = nombre de bouteilles
-- contenues dans un casier plein de cet article (utile pour convertir
-- casiers <-> bouteilles, ex : demi-casier = capacite_casier / 2).
-- ---------------------------------------------------------------------
alter table articles
    add column if not exists gestion_consigne boolean not null default false,
    add column if not exists prix_consigne_casier numeric(12,2),
    add column if not exists prix_consigne_bouteille numeric(12,2),
    add column if not exists capacite_casier numeric(12,2);

-- ---------------------------------------------------------------------
-- 2. SOLDE DE CONSIGNES DU CLIENT
-- Nombre de casiers/bouteilles vides que le client doit encore rendre
-- (ou dont il n'a pas encore récupéré la consigne payée).
-- ---------------------------------------------------------------------
alter table clients
    add column if not exists solde_consigne_casiers numeric(12,2) not null default 0,
    add column if not exists solde_consigne_bouteilles numeric(12,2) not null default 0;

-- ---------------------------------------------------------------------
-- 3. NOUVEAU TYPE DE MOUVEMENT DE STOCK : 'casse'
-- Permet de tracer une casse (bouteille/casier cassé) comme sortie de
-- stock au même titre qu'une vente, dans la même table mouvements_stock
-- (source de vérité unique du stock), sans dupliquer la logique.
-- ---------------------------------------------------------------------
alter table mouvements_stock drop constraint if exists mouvements_stock_type_mouvement_check;
alter table mouvements_stock add constraint mouvements_stock_type_mouvement_check
    check (type_mouvement in
        ('entree', 'sortie_vente', 'ajustement_inventaire', 'correction_manuelle', 'casse'));

-- ---------------------------------------------------------------------
-- 4. MOUVEMENTS DE CONSIGNE
-- Journal de tout ce qui fait varier le solde de consigne d'un client :
--   sortie_consigne  : on remet des casiers/bouteilles pleins au client,
--                       sa dette de consigne augmente
--   retour_consigne  : le client ramène des vides, sa dette diminue
--   rachat_consigne  : le client ne ramène jamais ses vides et on
--                       "solde" sa dette (perte définitive du contenant,
--                       encaissée comme telle)
-- ---------------------------------------------------------------------
create table if not exists mouvements_consigne (
    id                  uuid primary key default gen_random_uuid(),
    entreprise_id       uuid not null references entreprises(id) on delete cascade,
    client_id           uuid not null references clients(id) on delete cascade,
    article_id          uuid references articles(id) on delete set null,
    type_mouvement      text not null
                        check (type_mouvement in ('sortie_consigne', 'retour_consigne', 'rachat_consigne')),
    quantite_casiers    numeric(12,2) not null default 0,
    quantite_bouteilles numeric(12,2) not null default 0,
    montant             numeric(12,2) not null default 0,
    utilisateur_id      uuid references utilisateurs(id),
    created_at          timestamptz not null default now()
);

create index if not exists idx_mouvements_consigne_entreprise on mouvements_consigne(entreprise_id);
create index if not exists idx_mouvements_consigne_client on mouvements_consigne(client_id);

-- ---------------------------------------------------------------------
-- 5. CASSES
-- Casse = perte définitive de marchandise (bouteilles et/ou casiers),
-- jamais remboursée par le client contrairement à une consigne non
-- rendue. Table séparée de mouvements_stock pour garder le motif et la
-- valeur de la perte facilement consultables (reporting), tout en
-- restant reliée au mouvement de stock correspondant.
-- ---------------------------------------------------------------------
create table if not exists casses (
    id                      uuid primary key default gen_random_uuid(),
    entreprise_id           uuid not null references entreprises(id) on delete cascade,
    article_id              uuid not null references articles(id),
    quantite_bouteilles     numeric(12,2) not null default 0,
    quantite_casiers        numeric(12,2) not null default 0,
    valeur_perte            numeric(12,2) not null default 0,
    motif                   text,
    utilisateur_id          uuid references utilisateurs(id),
    created_at              timestamptz not null default now()
);

create index if not exists idx_casses_entreprise on casses(entreprise_id);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table mouvements_consigne enable row level security;
alter table casses enable row level security;

create policy "isolation_par_entreprise_mouvements_consigne"
    on mouvements_consigne
    for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

create policy "isolation_par_entreprise_casses"
    on casses
    for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

-- =====================================================================
-- FONCTION RPC : enregistrer_mouvement_consigne
-- Enregistre une sortie ou un retour de consigne pour un client et met
-- à jour son solde en une seule transaction atomique.
-- p_type_mouvement : 'sortie_consigne' | 'retour_consigne' | 'rachat_consigne'
-- =====================================================================
create or replace function enregistrer_mouvement_consigne(
    p_entreprise_id     uuid,
    p_client_id         uuid,
    p_article_id        uuid,
    p_type_mouvement    text,
    p_quantite_casiers  numeric,
    p_quantite_bouteilles numeric,
    p_montant           numeric,
    p_utilisateur_id    uuid
)
returns uuid
language plpgsql
security definer
as $$
declare
    v_mouvement_id uuid;
    v_signe        int;
begin
    if p_type_mouvement not in ('sortie_consigne', 'retour_consigne', 'rachat_consigne') then
        raise exception 'Type de mouvement de consigne invalide : %', p_type_mouvement;
    end if;

    -- Une sortie augmente la dette du client, un retour ou un rachat la diminue.
    v_signe := case when p_type_mouvement = 'sortie_consigne' then 1 else -1 end;

    insert into mouvements_consigne (
        entreprise_id, client_id, article_id, type_mouvement,
        quantite_casiers, quantite_bouteilles, montant, utilisateur_id
    )
    values (
        p_entreprise_id, p_client_id, p_article_id, p_type_mouvement,
        p_quantite_casiers, p_quantite_bouteilles, p_montant, p_utilisateur_id
    )
    returning id into v_mouvement_id;

    update clients
        set solde_consigne_casiers = greatest(0, solde_consigne_casiers + v_signe * p_quantite_casiers),
            solde_consigne_bouteilles = greatest(0, solde_consigne_bouteilles + v_signe * p_quantite_bouteilles)
        where id = p_client_id;

    return v_mouvement_id;
end;
$$;

-- =====================================================================
-- FONCTION RPC : enregistrer_casse
-- Déclare une casse : sort la quantité du stock (mouvement 'casse'),
-- journalise la perte avec sa valeur, en une transaction atomique.
-- La valeur de perte est calculée sur le prix d'achat (coût réel pour
-- l'entreprise), pas sur le prix de vente.
-- =====================================================================
create or replace function enregistrer_casse(
    p_entreprise_id         uuid,
    p_article_id            uuid,
    p_quantite_bouteilles   numeric,
    p_quantite_casiers      numeric,
    p_motif                 text,
    p_utilisateur_id        uuid
)
returns uuid
language plpgsql
security definer
as $$
declare
    v_casse_id      uuid;
    v_prix_achat    numeric;
    v_capacite      numeric;
    v_quantite_totale_unites numeric; -- en "unité de stock" de l'article (ex: bouteilles)
    v_stock_avant   numeric;
    v_stock_apres   numeric;
    v_valeur_perte  numeric;
begin
    select prix_achat, coalesce(capacite_casier, 1)
    into v_prix_achat, v_capacite
    from articles where id = p_article_id;

    if v_prix_achat is null then
        raise exception 'Article introuvable.';
    end if;

    -- Le stock de l'article est suivi dans son unité de vente (souvent
    -- le casier) : on convertit les bouteilles cassées hors casier en
    -- équivalent stock, et on additionne les casiers cassés tels quels.
    v_quantite_totale_unites := p_quantite_casiers + (p_quantite_bouteilles / nullif(v_capacite, 0));
    v_valeur_perte := v_quantite_totale_unites * v_prix_achat;

    insert into casses (
        entreprise_id, article_id, quantite_bouteilles, quantite_casiers,
        valeur_perte, motif, utilisateur_id
    )
    values (
        p_entreprise_id, p_article_id, p_quantite_bouteilles, p_quantite_casiers,
        v_valeur_perte, p_motif, p_utilisateur_id
    )
    returning id into v_casse_id;

    select stock_actuel into v_stock_avant from articles where id = p_article_id;
    v_stock_apres := v_stock_avant - v_quantite_totale_unites;

    insert into mouvements_stock (
        entreprise_id, article_id, type_mouvement,
        quantite, quantite_avant, quantite_apres,
        motif, reference_document, utilisateur_id
    )
    values (
        p_entreprise_id, p_article_id, 'casse',
        -v_quantite_totale_unites, v_stock_avant, v_stock_apres,
        coalesce(p_motif, 'Casse déclarée'), v_casse_id, p_utilisateur_id
    );

    update articles
        set stock_actuel = v_stock_apres, updated_at = now()
        where id = p_article_id;

    return v_casse_id;
end;
$$;
