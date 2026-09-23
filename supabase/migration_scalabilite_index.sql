-- =====================================================================
-- MIGRATION : INDEX COMPOSITES POUR LA SCALABILITÉ
-- À exécuter après migration_permissions_individuelles.sql.
--
-- Toutes les requêtes de l'app filtrent par entreprise_id (isolation
-- multi-tenant) ET, pour les listes/historiques, trient par
-- created_at desc. Un index simple sur entreprise_id oblige Postgres à
-- trier après coup ; un index composite (entreprise_id, created_at desc)
-- couvre le filtre ET le tri en une seule lecture d'index — décisif
-- dès que le volume de lignes par entreprise grossit (des milliers
-- d'utilisateurs simultanés = des milliers d'entreprises actives en
-- parallèle, chacune avec son propre historique qui grossit avec le
-- temps).
--
-- NOTE — PAS DE CONCURRENTLY ICI :
-- CREATE INDEX CONCURRENTLY refuse de tourner à l'intérieur d'une
-- transaction, or le SQL Editor de Supabase exécute TOUJOURS son
-- contenu dans une transaction implicite (même une seule instruction
-- collée seule) — CONCURRENTLY n'y fonctionne donc jamais, quelle que
-- soit la façon de coller le script. Cette version utilise un CREATE
-- INDEX classique : il prend un court verrou en écriture sur la table
-- pendant sa construction (quelques centaines de millisecondes à
-- quelques secondes selon le volume actuel de données, largement
-- acceptable au stade actuel du projet). Pour une création réellement
-- sans coupure une fois de gros volumes en production, utilise le CLI
-- Supabase (`supabase db execute -f supabase/migration_scalabilite_
-- index.sql`) avec la version CONCURRENTLY, hors de ce fichier, un
-- jour où ça devient nécessaire.
-- =====================================================================

create index if not exists idx_ventes_entreprise_date
    on ventes(entreprise_id, created_at desc);

create index if not exists idx_mouvements_stock_entreprise_date
    on mouvements_stock(entreprise_id, created_at desc);

create index if not exists idx_factures_entreprise_date
    on factures(entreprise_id, date_emission desc);

create index if not exists idx_paiements_entreprise_date
    on paiements(entreprise_id, created_at desc);

create index if not exists idx_articles_entreprise_actif
    on articles(entreprise_id, actif);

create index if not exists idx_clients_entreprise_nom
    on clients(entreprise_id, nom);

create index if not exists idx_livraisons_entreprise_date
    on livraisons(entreprise_id, created_at desc);

create index if not exists idx_paiements_personnel_entreprise_date
    on paiements_personnel(entreprise_id, created_at desc);

create index if not exists idx_tontines_entreprise_date
    on tontines(entreprise_id, created_at desc);

create index if not exists idx_fournisseurs_entreprise_actif
    on fournisseurs(entreprise_id, actif);

create index if not exists idx_employes_entreprise_actif
    on employes(entreprise_id, actif);

-- Accélère tableau_decisionnel / lister_stock_dormant (NOT EXISTS sur
-- mouvements_stock filtré par article_id + type_mouvement + date).
create index if not exists idx_mouvements_stock_article_type_date
    on mouvements_stock(article_id, type_mouvement, created_at desc);

-- Grand livre créances : ajoute la variante par entreprise (en plus de
-- l'index par client déjà en place) pour les futurs rapports globaux.
create index if not exists idx_mouvements_creance_entreprise_date
    on mouvements_creance(entreprise_id, created_at desc);
