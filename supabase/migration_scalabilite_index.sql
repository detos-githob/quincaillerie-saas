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
-- IMPORTANT — CREATE INDEX CONCURRENTLY :
-- Ces instructions créent les index sans verrouiller les tables en
-- écriture (zéro coupure de service), mais PostgreSQL interdit
-- CONCURRENTLY à l'intérieur d'une transaction. Le SQL Editor de
-- Supabase exécute par défaut TOUT le contenu collé comme UNE seule
-- transaction implicite, ce qui ferait échouer ce fichier tel quel.
-- Exécute donc CHAQUE INSTRUCTION SÉPARÉMENT (colle-en une, Run,
-- attends que ça finisse, colle la suivante) plutôt que tout le
-- fichier d'un coup. Alternative plus rapide si tu as le CLI Supabase :
--   supabase db execute -f supabase/migration_scalabilite_index.sql
-- qui exécute chaque instruction hors transaction automatiquement.
-- =====================================================================

create index concurrently if not exists idx_ventes_entreprise_date
    on ventes(entreprise_id, created_at desc);

create index concurrently if not exists idx_mouvements_stock_entreprise_date
    on mouvements_stock(entreprise_id, created_at desc);

create index concurrently if not exists idx_factures_entreprise_date
    on factures(entreprise_id, date_emission desc);

create index concurrently if not exists idx_paiements_entreprise_date
    on paiements(entreprise_id, created_at desc);

create index concurrently if not exists idx_articles_entreprise_actif
    on articles(entreprise_id, actif);

create index concurrently if not exists idx_clients_entreprise_nom
    on clients(entreprise_id, nom);

create index concurrently if not exists idx_livraisons_entreprise_date
    on livraisons(entreprise_id, created_at desc);

create index concurrently if not exists idx_paiements_personnel_entreprise_date
    on paiements_personnel(entreprise_id, created_at desc);

create index concurrently if not exists idx_tontines_entreprise_date
    on tontines(entreprise_id, created_at desc);

create index concurrently if not exists idx_fournisseurs_entreprise_actif
    on fournisseurs(entreprise_id, actif);

create index concurrently if not exists idx_employes_entreprise_actif
    on employes(entreprise_id, actif);

-- Accélère tableau_decisionnel / lister_stock_dormant (NOT EXISTS sur
-- mouvements_stock filtré par article_id + type_mouvement + date).
create index concurrently if not exists idx_mouvements_stock_article_type_date
    on mouvements_stock(article_id, type_mouvement, created_at desc);

-- Grand livre créances : ajoute la variante par entreprise (en plus de
-- l'index par client déjà en place) pour les futurs rapports globaux.
create index concurrently if not exists idx_mouvements_creance_entreprise_date
    on mouvements_creance(entreprise_id, created_at desc);
