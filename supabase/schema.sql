-- =====================================================================
-- SCHEMA SAAS GESTION QUINCAILLERIE - Bénin
-- Base : PostgreSQL (Supabase)
-- Architecture : Multi-tenant avec isolation par Row Level Security (RLS)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ENTREPRISES (TENANTS)
-- Chaque quincaillerie cliente = une ligne ici. Toutes les autres
-- tables sensibles référencent entreprise_id pour l'isolation.
-- ---------------------------------------------------------------------
create table entreprises (
    id              uuid primary key default gen_random_uuid(),
    nom             text not null,
    ifu             text,                          -- Numéro d'Identifiant Fiscal Unique
    regime_fiscal   text not null default 'forfait'
                    check (regime_fiscal in ('forfait', 'reel')),
                    -- 'reel' = obligation facture normalisée (e-MECeF)
                    -- 'forfait' = facture simple suffisante (pour l'instant)
    adresse         text,
    telephone       text,
    email           text,
    logo_url        text,
    plan_abonnement text not null default 'essai'
                    check (plan_abonnement in ('essai', 'starter', 'pro')),
    date_expiration_abonnement date,
    actif           boolean not null default true,
    created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. UTILISATEURS
-- Lié à auth.users de Supabase (auth_user_id). Un utilisateur
-- appartient à UNE entreprise et a UN rôle.
-- ---------------------------------------------------------------------
create table utilisateurs (
    id              uuid primary key default gen_random_uuid(),
    entreprise_id   uuid not null references entreprises(id) on delete cascade,
    auth_user_id    uuid not null references auth.users(id) on delete cascade,
    nom             text not null,
    telephone       text,
    role            text not null default 'vendeur'
                    check (role in ('gerant', 'comptable', 'vendeur')),
    actif           boolean not null default true,
    created_at      timestamptz not null default now(),
    unique (auth_user_id)
);

create index idx_utilisateurs_entreprise on utilisateurs(entreprise_id);

-- ---------------------------------------------------------------------
-- 3. CATEGORIES D'ARTICLES
-- ---------------------------------------------------------------------
create table categories (
    id              uuid primary key default gen_random_uuid(),
    entreprise_id   uuid not null references entreprises(id) on delete cascade,
    nom             text not null,
    created_at      timestamptz not null default now()
);

create index idx_categories_entreprise on categories(entreprise_id);

-- ---------------------------------------------------------------------
-- 4. DEPOTS (optionnel - multi-dépôt, activable en Phase 3)
-- ---------------------------------------------------------------------
create table depots (
    id              uuid primary key default gen_random_uuid(),
    entreprise_id   uuid not null references entreprises(id) on delete cascade,
    nom             text not null,
    adresse         text,
    est_principal   boolean not null default false,
    created_at      timestamptz not null default now()
);

create index idx_depots_entreprise on depots(entreprise_id);

-- ---------------------------------------------------------------------
-- 5. ARTICLES (le catalogue produits de la quincaillerie)
-- stock_actuel est dénormalisé (mis à jour via trigger sur mouvements_stock)
-- pour des lectures rapides à la caisse sans recalcul à chaque fois.
-- ---------------------------------------------------------------------
create table articles (
    id              uuid primary key default gen_random_uuid(),
    entreprise_id   uuid not null references entreprises(id) on delete cascade,
    categorie_id    uuid references categories(id) on delete set null,
    reference       text,                          -- code interne / code-barres
    designation     text not null,
    unite           text not null default 'unité',  -- unité, sac, mètre, litre...
    prix_achat      numeric(12,2) not null default 0,
    prix_vente      numeric(12,2) not null default 0,
    stock_actuel    numeric(12,2) not null default 0,
    seuil_alerte    numeric(12,2) not null default 5,
    actif           boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index idx_articles_entreprise on articles(entreprise_id);
create index idx_articles_categorie on articles(categorie_id);

-- ---------------------------------------------------------------------
-- 6. MOUVEMENTS DE STOCK
-- Trace TOUTE variation de stock (vente, entrée fournisseur, ajustement
-- d'inventaire, correction manuelle). C'est la source de vérité ;
-- articles.stock_actuel n'est qu'un cache mis à jour à partir d'ici.
-- ---------------------------------------------------------------------
create table mouvements_stock (
    id                  uuid primary key default gen_random_uuid(),
    entreprise_id       uuid not null references entreprises(id) on delete cascade,
    article_id          uuid not null references articles(id) on delete cascade,
    depot_id            uuid references depots(id) on delete set null,
    type_mouvement      text not null
                        check (type_mouvement in
                            ('entree', 'sortie_vente', 'ajustement_inventaire', 'correction_manuelle')),
    quantite            numeric(12,2) not null,   -- positif ou négatif selon le type
    quantite_avant      numeric(12,2) not null,
    quantite_apres      numeric(12,2) not null,
    motif               text,
    reference_document  uuid,                      -- pointe vers ventes.id ou inventaires.id
    utilisateur_id      uuid references utilisateurs(id),
    created_at          timestamptz not null default now()
);

create index idx_mouvements_entreprise on mouvements_stock(entreprise_id);
create index idx_mouvements_article on mouvements_stock(article_id);
create index idx_mouvements_date on mouvements_stock(created_at);

-- ---------------------------------------------------------------------
-- 7. CLIENTS
-- solde_credit > 0 signifie que le client doit de l'argent à la boutique
-- ---------------------------------------------------------------------
create table clients (
    id              uuid primary key default gen_random_uuid(),
    entreprise_id   uuid not null references entreprises(id) on delete cascade,
    nom             text not null,
    telephone       text,
    adresse         text,
    ifu             text,                          -- utile pour facture normalisée B2B
    solde_credit    numeric(12,2) not null default 0,
    created_at      timestamptz not null default now()
);

create index idx_clients_entreprise on clients(entreprise_id);

-- ---------------------------------------------------------------------
-- 8. VENTES (l'en-tête de chaque transaction de vente)
-- ---------------------------------------------------------------------
create table ventes (
    id              uuid primary key default gen_random_uuid(),
    entreprise_id   uuid not null references entreprises(id) on delete cascade,
    numero_vente    text not null,                 -- numérotation séquentielle par entreprise
    client_id       uuid references clients(id) on delete set null,  -- null = vente comptant anonyme
    utilisateur_id  uuid references utilisateurs(id),
    montant_total   numeric(12,2) not null default 0,
    montant_paye    numeric(12,2) not null default 0,
    mode_paiement   text not null default 'especes'
                    check (mode_paiement in ('especes', 'mobile_money', 'credit', 'mixte')),
    statut          text not null default 'payee'
                    check (statut in ('payee', 'partielle', 'creance', 'annulee')),
    created_at      timestamptz not null default now(),
    unique (entreprise_id, numero_vente)
);

create index idx_ventes_entreprise on ventes(entreprise_id);
create index idx_ventes_client on ventes(client_id);
create index idx_ventes_date on ventes(created_at);

-- ---------------------------------------------------------------------
-- 9. LIGNES DE VENTE (le détail article par article d'une vente)
-- prix_achat_unitaire est figé au moment de la vente (snapshot) pour
-- que le calcul de marge reste exact même si le prix d'achat change après.
-- ---------------------------------------------------------------------
create table lignes_vente (
    id                      uuid primary key default gen_random_uuid(),
    vente_id                uuid not null references ventes(id) on delete cascade,
    article_id              uuid not null references articles(id),
    quantite                numeric(12,2) not null,
    prix_unitaire           numeric(12,2) not null,
    prix_achat_unitaire     numeric(12,2) not null,  -- snapshot pour la marge
    remise                  numeric(12,2) not null default 0,
    montant_ligne           numeric(12,2) not null
);

create index idx_lignes_vente_vente on lignes_vente(vente_id);
create index idx_lignes_vente_article on lignes_vente(article_id);

-- ---------------------------------------------------------------------
-- 10. FACTURES
-- type = 'simple' -> PDF libre, pas de contrainte DGI
-- type = 'normalisee' -> doit passer par l'API e-MECeF pour obtenir
-- NIM + sceau électronique + QR code avant émission définitive
-- ---------------------------------------------------------------------
create table factures (
    id                  uuid primary key default gen_random_uuid(),
    entreprise_id       uuid not null references entreprises(id) on delete cascade,
    vente_id            uuid not null references ventes(id) on delete cascade,
    type_facture        text not null default 'simple'
                        check (type_facture in ('simple', 'normalisee')),
    numero_facture      text not null,
    date_emission       timestamptz not null default now(),
    nim                 text,                       -- rempli uniquement si normalisée
    sceau_electronique  text,
    qr_code_url         text,
    statut_emecef       text default 'non_applicable'
                        check (statut_emecef in
                            ('non_applicable', 'en_attente', 'validee', 'echec')),
                        -- 'en_attente' = file d'attente locale en mode dégradé (hors-ligne)
    pdf_url             text,
    created_at          timestamptz not null default now(),
    unique (entreprise_id, numero_facture)
);

create index idx_factures_entreprise on factures(entreprise_id);
create index idx_factures_vente on factures(vente_id);
create index idx_factures_statut_emecef on factures(statut_emecef)
    where statut_emecef = 'en_attente';  -- pour retrouver vite la file d'attente à resynchroniser

-- ---------------------------------------------------------------------
-- 11. PAIEMENTS
-- Permet de tracer les paiements partiels / échelonnés sur une créance
-- ---------------------------------------------------------------------
create table paiements (
    id                      uuid primary key default gen_random_uuid(),
    entreprise_id           uuid not null references entreprises(id) on delete cascade,
    vente_id                uuid references ventes(id) on delete set null,
    client_id               uuid references clients(id) on delete set null,
    montant                 numeric(12,2) not null,
    mode_paiement           text not null
                            check (mode_paiement in ('especes', 'mobile_money')),
    reference_transaction   text,                   -- ID transaction Mobile Money
    date_paiement           timestamptz not null default now(),
    created_at              timestamptz not null default now()
);

create index idx_paiements_entreprise on paiements(entreprise_id);
create index idx_paiements_client on paiements(client_id);

-- ---------------------------------------------------------------------
-- 12. INVENTAIRES
-- ---------------------------------------------------------------------
create table inventaires (
    id              uuid primary key default gen_random_uuid(),
    entreprise_id   uuid not null references entreprises(id) on delete cascade,
    depot_id        uuid references depots(id) on delete set null,
    statut          text not null default 'en_cours'
                    check (statut in ('en_cours', 'valide', 'annule')),
    date_debut      timestamptz not null default now(),
    date_fin        timestamptz,
    utilisateur_id  uuid references utilisateurs(id),
    created_at      timestamptz not null default now()
);

create table lignes_inventaire (
    id                  uuid primary key default gen_random_uuid(),
    inventaire_id       uuid not null references inventaires(id) on delete cascade,
    article_id          uuid not null references articles(id),
    quantite_theorique  numeric(12,2) not null,
    quantite_comptee    numeric(12,2),
    ecart               numeric(12,2) generated always as
                        (coalesce(quantite_comptee, 0) - quantite_theorique) stored
);

create index idx_inventaires_entreprise on inventaires(entreprise_id);
create index idx_lignes_inventaire_inventaire on lignes_inventaire(inventaire_id);

-- ---------------------------------------------------------------------
-- 13. ALERTES (santé de l'entreprise)
-- ---------------------------------------------------------------------
create table alertes (
    id              uuid primary key default gen_random_uuid(),
    entreprise_id   uuid not null references entreprises(id) on delete cascade,
    type_alerte     text not null
                    check (type_alerte in
                        ('stock_bas', 'rupture', 'marge_faible', 'creance_retard', 'ca_baisse')),
    article_id      uuid references articles(id) on delete cascade,
    client_id       uuid references clients(id) on delete cascade,
    message         text not null,
    niveau          text not null default 'info'
                    check (niveau in ('info', 'warning', 'critique')),
    lue             boolean not null default false,
    created_at      timestamptz not null default now()
);

create index idx_alertes_entreprise on alertes(entreprise_id);
create index idx_alertes_non_lues on alertes(entreprise_id, lue) where lue = false;

-- ---------------------------------------------------------------------
-- 14. JOURNAL D'AUDIT
-- Traçabilité des actions sensibles (annulation de vente, ajustement
-- de stock manuel, modification de prix) - protection contre la fraude
-- interne, sujet sensible en commerce de détail.
-- ---------------------------------------------------------------------
create table journal_audit (
    id                  uuid primary key default gen_random_uuid(),
    entreprise_id       uuid not null references entreprises(id) on delete cascade,
    utilisateur_id      uuid references utilisateurs(id),
    action              text not null,              -- ex: 'annulation_vente', 'ajustement_stock'
    table_concernee     text not null,
    enregistrement_id   uuid,
    donnees_avant       jsonb,
    donnees_apres       jsonb,
    created_at          timestamptz not null default now()
);

create index idx_journal_audit_entreprise on journal_audit(entreprise_id);

-- =====================================================================
-- SECURITE : ROW LEVEL SECURITY (RLS)
-- Principe : chaque table liée à une entreprise n'est visible que par
-- les utilisateurs authentifiés appartenant à CETTE entreprise.
-- =====================================================================

-- Fonction utilitaire : renvoie l'entreprise_id de l'utilisateur connecté
create or replace function entreprise_de_l_utilisateur_connecte()
returns uuid
language sql
security definer
stable
as $$
    select entreprise_id from utilisateurs where auth_user_id = auth.uid();
$$;

-- Activation de RLS sur toutes les tables sensibles
alter table entreprises enable row level security;
alter table utilisateurs enable row level security;
alter table categories enable row level security;
alter table depots enable row level security;
alter table articles enable row level security;
alter table mouvements_stock enable row level security;
alter table clients enable row level security;
alter table ventes enable row level security;
alter table lignes_vente enable row level security;
alter table factures enable row level security;
alter table paiements enable row level security;
alter table inventaires enable row level security;
alter table lignes_inventaire enable row level security;
alter table alertes enable row level security;
alter table journal_audit enable row level security;

-- Exemple de policy (à répliquer sur chaque table avec entreprise_id) :
create policy "isolation_par_entreprise_articles"
    on articles
    for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

create policy "isolation_par_entreprise_ventes"
    on ventes
    for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

create policy "isolation_par_entreprise_clients"
    on clients
    for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

create policy "isolation_par_entreprise_factures"
    on factures
    for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

-- Table sans entreprise_id direct : lignes_vente (isolation via ventes)
create policy "isolation_par_entreprise_lignes_vente"
    on lignes_vente
    for all
    using (
        vente_id in (
            select id from ventes
            where entreprise_id = entreprise_de_l_utilisateur_connecte()
        )
    )
    with check (
        vente_id in (
            select id from ventes
            where entreprise_id = entreprise_de_l_utilisateur_connecte()
        )
    );

-- categories
create policy "isolation_par_entreprise_categories"
    on categories
    for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

-- depots
create policy "isolation_par_entreprise_depots"
    on depots
    for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

-- mouvements_stock
create policy "isolation_par_entreprise_mouvements_stock"
    on mouvements_stock
    for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

-- paiements
create policy "isolation_par_entreprise_paiements"
    on paiements
    for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

-- inventaires
create policy "isolation_par_entreprise_inventaires"
    on inventaires
    for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

-- lignes_inventaire : sans entreprise_id direct, isolation via inventaires
create policy "isolation_par_entreprise_lignes_inventaire"
    on lignes_inventaire
    for all
    using (
        inventaire_id in (
            select id from inventaires
            where entreprise_id = entreprise_de_l_utilisateur_connecte()
        )
    )
    with check (
        inventaire_id in (
            select id from inventaires
            where entreprise_id = entreprise_de_l_utilisateur_connecte()
        )
    );

-- alertes
create policy "isolation_par_entreprise_alertes"
    on alertes
    for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

-- journal_audit : lecture seule (insertion réservée au backend via
-- service_role, jamais modifiée ni supprimée par un utilisateur normal)
create policy "lecture_journal_audit_par_entreprise"
    on journal_audit
    for select
    using (entreprise_id = entreprise_de_l_utilisateur_connecte());

create policy "insertion_journal_audit_par_entreprise"
    on journal_audit
    for insert
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

-- utilisateurs : un gérant peut modifier les comptes de son entreprise,
-- un utilisateur standard ne modifie que sa propre fiche
create policy "gerant_gere_les_utilisateurs_de_son_entreprise"
    on utilisateurs
    for update
    using (
        entreprise_id = entreprise_de_l_utilisateur_connecte()
        and exists (
            select 1 from utilisateurs u
            where u.auth_user_id = auth.uid() and u.role = 'gerant'
        )
    );

create policy "utilisateur_modifie_sa_propre_fiche"
    on utilisateurs
    for update
    using (auth_user_id = auth.uid());

-- entreprises : seul un gérant peut modifier les infos de sa propre
-- entreprise (régime fiscal, logo, coordonnées)
create policy "gerant_modifie_son_entreprise"
    on entreprises
    for update
    using (
        id = entreprise_de_l_utilisateur_connecte()
        and exists (
            select 1 from utilisateurs u
            where u.auth_user_id = auth.uid() and u.role = 'gerant'
        )
    );

-- =====================================================================
-- FONCTION RPC : creer_vente
-- Enregistre une vente complète (en-tête + lignes + mouvements de stock
-- + facture simple) de façon ATOMIQUE : soit tout est écrit, soit rien
-- n'est écrit en cas d'erreur au milieu du traitement. Appelée depuis
-- le frontend via supabase.rpc('creer_vente', {...}).
-- =====================================================================
create or replace function creer_vente(
    p_entreprise_id  uuid,
    p_client_id      uuid,
    p_utilisateur_id uuid,
    p_mode_paiement  text,
    p_lignes         jsonb  -- tableau d'objets :
                            -- {article_id, quantite, prix_unitaire, prix_achat_unitaire, remise}
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
begin
    -- Numérotation séquentielle simple par jour et par entreprise
    select 'V-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((count(*) + 1)::text, 4, '0')
    into v_numero_vente
    from ventes
    where entreprise_id = p_entreprise_id
      and created_at::date = current_date;

    -- Calcul du montant total de la vente
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

    -- Lignes de vente + mouvements de stock associés
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

    -- Créance client si vente à crédit
    if p_mode_paiement = 'credit' and p_client_id is not null then
        update clients set solde_credit = solde_credit + v_total
            where id = p_client_id;
    end if;

    -- Facture simple générée automatiquement pour toute vente.
    -- La bascule vers 'normalisee' + appel à l'API e-MECeF est prévue
    -- en Phase 3, pour les entreprises en regime_fiscal = 'reel'.
    insert into factures (entreprise_id, vente_id, type_facture, numero_facture, statut_emecef)
    values (p_entreprise_id, v_vente_id, 'simple', 'F-' || v_numero_vente, 'non_applicable');

    return v_vente_id;
end;
$$;

-- Policy spéciale pour la table entreprises elle-même :
-- un utilisateur ne voit que SA propre entreprise
create policy "voir_sa_propre_entreprise"
    on entreprises
    for select
    using (id = entreprise_de_l_utilisateur_connecte());

-- Policy pour utilisateurs : un utilisateur voit les collègues de sa
-- propre entreprise (utile pour l'écran de gestion des accès)
create policy "voir_collegues_meme_entreprise"
    on utilisateurs
    for select
    using (entreprise_id = entreprise_de_l_utilisateur_connecte());
