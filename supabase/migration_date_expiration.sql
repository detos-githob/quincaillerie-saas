-- =====================================================================
-- MIGRATION : DATE D'EXPIRATION DES PRODUITS
-- À exécuter après migration_essai_gratuit.sql.
--
-- Ajoute une date d'expiration optionnelle sur les articles, utilisée
-- en priorité par le secteur "alimentation générale" pour repérer les
-- produits à évacuer avant péremption. Le champ reste disponible pour
-- tous les secteurs (nullable, sans impact sur ceux qui ne l'utilisent
-- pas), l'app ne l'affiche activement que pour ce secteur.
-- =====================================================================

alter table articles
    add column if not exists date_expiration date;

-- Index partiel : n'indexe que les articles qui ont effectivement une
-- date d'expiration renseignée, pour accélérer les requêtes du tableau
-- de bord ("produits à évacuer sous 3 mois", "produits déjà expirés").
create index if not exists idx_articles_date_expiration
    on articles(entreprise_id, date_expiration)
    where date_expiration is not null;
