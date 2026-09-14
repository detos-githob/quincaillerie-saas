-- =====================================================================
-- MIGRATION : FOURNISSEURS, VENTE EN GROS / DEMI-GROS, LIVRAISON
-- À exécuter après migration_type_facture.sql, en une fois dans le
-- SQL Editor de Supabase.
--
-- Ajoute :
--   1. Tarification gros / demi-gros sur les articles + type de client
--   2. Fournisseurs
--   3. Commandes fournisseur (brouillon -> envoyée -> réceptionnée)
--   4. Livraisons (pour les ventes en gros/demi-gros qui doivent être
--      livrées, ex : chantier, dépôt client)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TARIFICATION GROS / DEMI-GROS SUR LES ARTICLES
-- Les paliers sont optionnels : si non renseignés, l'article reste
-- vendu au prix détail (prix_vente) quel que soit le client/la quantité.
-- ---------------------------------------------------------------------
alter table articles
    add column if not exists prix_demi_gros numeric(12,2),
    add column if not exists prix_gros       numeric(12,2),
    add column if not exists seuil_demi_gros numeric(12,2),
    add column if not exists seuil_gros      numeric(12,2);

-- ---------------------------------------------------------------------
-- 2. TYPE DE CLIENT (détail / demi-gros / gros)
-- Permet d'appliquer automatiquement le bon palier de prix à la vente,
-- indépendamment de la quantité achetée (un client "gros" habituel
-- profite du tarif gros dès la première unité).
-- ---------------------------------------------------------------------
alter table clients
    add column if not exists type_client text not null default 'detail'
    check (type_client in ('detail', 'demi_gros', 'gros'));

-- ---------------------------------------------------------------------
-- 3. FOURNISSEURS
-- solde_du > 0 signifie que l'entreprise doit encore de l'argent à ce
-- fournisseur (achats reçus mais pas encore réglés).
-- ---------------------------------------------------------------------
create table if not exists fournisseurs (
    id                      uuid primary key default gen_random_uuid(),
    entreprise_id           uuid not null references entreprises(id) on delete cascade,
    nom                     text not null,
    contact_nom             text,
    telephone               text,
    adresse                 text,
    ifu                     text,
    delai_livraison_jours   integer,
    solde_du                numeric(12,2) not null default 0,
    actif                   boolean not null default true,
    created_at              timestamptz not null default now()
);

create index if not exists idx_fournisseurs_entreprise on fournisseurs(entreprise_id);

-- ---------------------------------------------------------------------
-- 4. COMMANDES FOURNISSEUR (en-tête)
-- ---------------------------------------------------------------------
create table if not exists commandes_fournisseur (
    id                      uuid primary key default gen_random_uuid(),
    entreprise_id           uuid not null references entreprises(id) on delete cascade,
    fournisseur_id          uuid not null references fournisseurs(id) on delete restrict,
    numero_commande         text not null,
    statut                  text not null default 'brouillon'
                            check (statut in
                                ('brouillon', 'envoyee', 'receptionnee_partielle', 'receptionnee', 'annulee')),
    date_commande           timestamptz not null default now(),
    date_reception_prevue   date,
    montant_total           numeric(12,2) not null default 0,
    utilisateur_id          uuid references utilisateurs(id),
    created_at              timestamptz not null default now(),
    unique (entreprise_id, numero_commande)
);

create index if not exists idx_commandes_fournisseur_entreprise on commandes_fournisseur(entreprise_id);
create index if not exists idx_commandes_fournisseur_fournisseur on commandes_fournisseur(fournisseur_id);

-- ---------------------------------------------------------------------
-- 5. LIGNES DE COMMANDE FOURNISSEUR
-- quantite_recue est mise à jour progressivement (réceptions partielles
-- possibles, courant en gros/demi-gros : le camion arrive en plusieurs
-- fois).
-- ---------------------------------------------------------------------
create table if not exists lignes_commande_fournisseur (
    id                      uuid primary key default gen_random_uuid(),
    commande_id             uuid not null references commandes_fournisseur(id) on delete cascade,
    article_id              uuid not null references articles(id),
    quantite_commandee      numeric(12,2) not null,
    quantite_recue          numeric(12,2) not null default 0,
    prix_achat_unitaire     numeric(12,2) not null
);

create index if not exists idx_lignes_commande_fournisseur_commande on lignes_commande_fournisseur(commande_id);

-- ---------------------------------------------------------------------
-- 6. LIVRAISONS
-- Rattachée à une vente existante (souvent une vente en gros/demi-gros
-- à livrer sur chantier ou au dépôt du client). vente_id/client_id sont
-- nullables pour rester réutilisable par d'autres modules (ex : dépôt
-- de boissons) qui pourraient livrer sans passer par une vente classique.
-- ---------------------------------------------------------------------
create table if not exists livraisons (
    id                      uuid primary key default gen_random_uuid(),
    entreprise_id           uuid not null references entreprises(id) on delete cascade,
    vente_id                uuid references ventes(id) on delete set null,
    client_id               uuid references clients(id) on delete set null,
    adresse_livraison       text,
    statut                  text not null default 'en_attente'
                            check (statut in ('en_attente', 'en_cours', 'livree', 'annulee')),
    livreur_nom             text,
    livreur_telephone       text,
    date_prevue             timestamptz,
    date_livraison          timestamptz,
    notes                   text,
    utilisateur_id          uuid references utilisateurs(id),
    created_at              timestamptz not null default now()
);

create index if not exists idx_livraisons_entreprise on livraisons(entreprise_id);
create index if not exists idx_livraisons_statut on livraisons(entreprise_id, statut);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table fournisseurs enable row level security;
alter table commandes_fournisseur enable row level security;
alter table lignes_commande_fournisseur enable row level security;
alter table livraisons enable row level security;

create policy "isolation_par_entreprise_fournisseurs"
    on fournisseurs
    for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

create policy "isolation_par_entreprise_commandes_fournisseur"
    on commandes_fournisseur
    for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

-- lignes_commande_fournisseur : sans entreprise_id direct, isolation via commandes_fournisseur
create policy "isolation_par_entreprise_lignes_commande_fournisseur"
    on lignes_commande_fournisseur
    for all
    using (
        commande_id in (
            select id from commandes_fournisseur
            where entreprise_id = entreprise_de_l_utilisateur_connecte()
        )
    )
    with check (
        commande_id in (
            select id from commandes_fournisseur
            where entreprise_id = entreprise_de_l_utilisateur_connecte()
        )
    );

create policy "isolation_par_entreprise_livraisons"
    on livraisons
    for all
    using (entreprise_id = entreprise_de_l_utilisateur_connecte())
    with check (entreprise_id = entreprise_de_l_utilisateur_connecte());

-- =====================================================================
-- FONCTION RPC : creer_commande_fournisseur
-- Crée l'en-tête + les lignes d'une commande fournisseur de façon
-- atomique et calcule le montant total. Statut initial : 'envoyee'
-- (la commande est considérée transmise au fournisseur dès sa saisie ;
-- un statut 'brouillon' reste possible via mise à jour directe si
-- besoin d'un mode brouillon plus tard).
-- =====================================================================
create or replace function creer_commande_fournisseur(
    p_entreprise_id         uuid,
    p_fournisseur_id        uuid,
    p_utilisateur_id        uuid,
    p_date_reception_prevue date,
    p_lignes                jsonb -- [{article_id, quantite_commandee, prix_achat_unitaire}]
)
returns uuid
language plpgsql
security definer
as $$
declare
    v_commande_id     uuid;
    v_numero_commande text;
    v_total           numeric := 0;
    v_ligne           jsonb;
begin
    select 'CF-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((count(*) + 1)::text, 4, '0')
    into v_numero_commande
    from commandes_fournisseur
    where entreprise_id = p_entreprise_id
      and created_at::date = current_date;

    for v_ligne in select * from jsonb_array_elements(p_lignes)
    loop
        v_total := v_total
            + (v_ligne->>'quantite_commandee')::numeric * (v_ligne->>'prix_achat_unitaire')::numeric;
    end loop;

    insert into commandes_fournisseur (
        entreprise_id, fournisseur_id, numero_commande, statut,
        date_reception_prevue, montant_total, utilisateur_id
    )
    values (
        p_entreprise_id, p_fournisseur_id, v_numero_commande, 'envoyee',
        p_date_reception_prevue, v_total, p_utilisateur_id
    )
    returning id into v_commande_id;

    for v_ligne in select * from jsonb_array_elements(p_lignes)
    loop
        insert into lignes_commande_fournisseur (
            commande_id, article_id, quantite_commandee, prix_achat_unitaire
        )
        values (
            v_commande_id,
            (v_ligne->>'article_id')::uuid,
            (v_ligne->>'quantite_commandee')::numeric,
            (v_ligne->>'prix_achat_unitaire')::numeric
        );
    end loop;

    return v_commande_id;
end;
$$;

-- =====================================================================
-- FONCTION RPC : receptionner_commande_fournisseur
-- Enregistre la réception (totale ou partielle) d'une commande :
-- met à jour les quantités reçues, crée un mouvement de stock 'entree'
-- par ligne réceptionnée, met à jour le stock des articles, la dette
-- envers le fournisseur (solde_du) et le statut de la commande.
-- Atomique : tout ou rien.
-- =====================================================================
create or replace function receptionner_commande_fournisseur(
    p_commande_id       uuid,
    p_utilisateur_id    uuid,
    p_lignes            jsonb -- [{ligne_id, quantite_recue}] = quantité reçue LORS DE CETTE réception
)
returns void
language plpgsql
security definer
as $$
declare
    v_entreprise_id     uuid;
    v_fournisseur_id    uuid;
    v_ligne             jsonb;
    v_ligne_id          uuid;
    v_quantite_recue    numeric;
    v_article_id        uuid;
    v_prix_achat        numeric;
    v_stock_avant       numeric;
    v_stock_apres       numeric;
    v_valeur_receptionnee numeric := 0;
    v_total_commande    numeric;
    v_total_recu        numeric;
begin
    select entreprise_id, fournisseur_id into v_entreprise_id, v_fournisseur_id
    from commandes_fournisseur where id = p_commande_id;

    if v_entreprise_id is null then
        raise exception 'Commande fournisseur introuvable.';
    end if;

    for v_ligne in select * from jsonb_array_elements(p_lignes)
    loop
        v_ligne_id       := (v_ligne->>'ligne_id')::uuid;
        v_quantite_recue := (v_ligne->>'quantite_recue')::numeric;

        if v_quantite_recue <= 0 then
            continue;
        end if;

        select article_id, prix_achat_unitaire into v_article_id, v_prix_achat
        from lignes_commande_fournisseur where id = v_ligne_id and commande_id = p_commande_id;

        if v_article_id is null then
            raise exception 'Ligne de commande introuvable.';
        end if;

        update lignes_commande_fournisseur
            set quantite_recue = quantite_recue + v_quantite_recue
            where id = v_ligne_id;

        select stock_actuel into v_stock_avant from articles where id = v_article_id;
        v_stock_apres := v_stock_avant + v_quantite_recue;

        insert into mouvements_stock (
            entreprise_id, article_id, type_mouvement,
            quantite, quantite_avant, quantite_apres,
            motif, reference_document, utilisateur_id
        )
        values (
            v_entreprise_id, v_article_id, 'entree',
            v_quantite_recue, v_stock_avant, v_stock_apres,
            'Réception commande fournisseur', p_commande_id, p_utilisateur_id
        );

        update articles
            set stock_actuel = v_stock_apres, prix_achat = v_prix_achat, updated_at = now()
            where id = v_article_id;

        v_valeur_receptionnee := v_valeur_receptionnee + v_quantite_recue * v_prix_achat;
    end loop;

    -- La dette envers le fournisseur augmente de la valeur reçue
    -- (l'achat n'est dû qu'à réception, pas à la simple commande).
    update fournisseurs set solde_du = solde_du + v_valeur_receptionnee
        where id = v_fournisseur_id;

    -- Détermine si la commande est totalement ou partiellement réceptionnée
    select sum(quantite_commandee), sum(quantite_recue)
    into v_total_commande, v_total_recu
    from lignes_commande_fournisseur where commande_id = p_commande_id;

    update commandes_fournisseur
        set statut = case
            when v_total_recu >= v_total_commande then 'receptionnee'
            when v_total_recu > 0 then 'receptionnee_partielle'
            else statut
        end
        where id = p_commande_id;
end;
$$;
