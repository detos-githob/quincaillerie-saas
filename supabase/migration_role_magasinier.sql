-- =====================================================================
-- MIGRATION : RÔLE "MAGASINIER"
-- À exécuter après migration_personnel_depenses.sql (ou la dernière
-- migration en date).
--
-- Ajoute un 4e rôle dédié à la gestion physique du stock (réception,
-- inventaire, livraisons), distinct du comptable (finances) et du
-- vendeur (point de vente). Voir src/lib/permissions.ts pour la matrice
-- de permissions complète appliquée côté app.
-- =====================================================================

alter table utilisateurs drop constraint if exists utilisateurs_role_check;
alter table utilisateurs add constraint utilisateurs_role_check
    check (role in ('gerant', 'comptable', 'vendeur', 'magasinier'));
