-- =====================================================================
-- MIGRATION : CORRECTIFS DE SÉCURITÉ CRITIQUES (audit du 04/11/2026)
-- À exécuter après migration_support_editable.sql. Idempotente.
-- C1 : fonctions anciennes ouvertes à tous ; droits d'exécution des visiteurs.
-- C2 : le gérant ne peut plus modifier son abonnement lui-même.
-- C3 : un utilisateur ne peut plus changer son rôle ni son entreprise.
-- =====================================================================

drop function if exists receptionner_livraison_fournisseur(uuid, uuid, uuid, jsonb);
drop function if exists creer_vente(uuid, uuid, uuid, text, jsonb, text, text, jsonb);
revoke execute on all functions in schema public from anon, public;
alter default privileges in schema public revoke execute on functions from anon, public;
grant execute on function est_super_admin() to anon;
revoke insert, update, delete on entreprises from authenticated;
grant update (nom, adresse, telephone, email, ifu, regime_fiscal, logo_url, secteurs_actifs, secteur_activite, secteur_activite_autre, fuseau_horaire) on entreprises to authenticated;
revoke insert, update, delete on utilisateurs from authenticated;
grant update (nom, telephone) on utilisateurs to authenticated;
