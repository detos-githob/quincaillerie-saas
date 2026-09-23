-- =====================================================================
-- MIGRATION : CORRECTION URGENTE — plan_abonnement 'business' rejeté
-- À exécuter dès que possible, indépendamment de l'ordre des autres
-- migrations (celle-ci corrige un bug bloquant préexistant).
--
-- BUG : la contrainte CHECK d'origine sur entreprises.plan_abonnement
-- n'autorisait que ('essai', 'starter', 'pro'). Or 'business' est
-- l'identifiant réellement utilisé par :
--   - le catalogue d'offres self-service (src/services/abonnementService.ts)
--   - le flux de paiement Kkiapay (Edge Function verifier-paiement-
--     abonnement, qui écrit plan_abonnement = 'business' après un
--     paiement réussi)
-- Concrètement : N'IMPORTE QUEL client ayant payé pour l'offre Business
-- via Kkiapay a dû essuyer une erreur silencieuse à ce moment-là (la
-- Edge Function utilise la clé service_role, qui contourne RLS mais
-- PAS les contraintes CHECK — l'update échouait et la ligne n'était
-- jamais mise à jour malgré le paiement encaissé).
--
-- Si des paiements Business ont eu lieu récemment sans que le palier
-- du client ait changé, vérifie manuellement et corrige ces entreprises
-- après avoir appliqué cette migration (requête de diagnostic fournie
-- en bas de fichier).
-- =====================================================================

alter table entreprises drop constraint if exists entreprises_plan_abonnement_check;
alter table entreprises add constraint entreprises_plan_abonnement_check
    check (plan_abonnement in ('essai', 'starter', 'business', 'pro'));

-- ---------------------------------------------------------------------
-- DIAGNOSTIC (à lancer séparément, en lecture seule) : repère les
-- entreprises encore sur "essai"/"starter" alors qu'elles ont un
-- paiement récent enregistré — signe probable d'une mise à jour de
-- palier qui a échoué à cause de ce bug avant le correctif.
-- ---------------------------------------------------------------------
-- select e.id, e.nom, e.plan_abonnement, e.periodicite_abonnement
-- from entreprises e
-- where e.plan_abonnement in ('essai', 'starter');
