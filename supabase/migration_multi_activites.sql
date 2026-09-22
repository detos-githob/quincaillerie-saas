-- =====================================================================
-- MIGRATION : GESTION MULTI-ACTIVITÉS RÉELLE
-- À exécuter après migration_annulation_avoir.sql.
--
-- Jusqu'ici, une entreprise n'avait qu'UN SEUL secteur_activite, qui
-- pilotait à lui seul quels modules apparaissaient (Fournisseurs pour
-- quincaillerie, Dépôt boissons pour depot_boissons...). Beaucoup
-- d'entreprises réelles cumulent plusieurs activités (ex : quincaillerie
-- ET dépôt de boissons dans le même point de vente). `secteurs_actifs`
-- permet d'activer plusieurs modules sectoriels simultanément, sans
-- rien retirer à `secteur_activite` qui reste l'activité "principale"
-- (utilisée pour la personnalisation du tableau de bord par défaut).
-- =====================================================================

alter table entreprises
    add column if not exists secteurs_actifs text[] not null default '{}';

-- Backfill : chaque entreprise démarre avec son secteur principal déjà
-- actif, pour ne rien changer au comportement existant tant que le
-- gérant n'a pas explicitement activé d'autres activités.
update entreprises
    set secteurs_actifs = array[secteur_activite]
    where secteurs_actifs = '{}';

-- Garde-fou : uniquement les valeurs de secteur reconnues.
alter table entreprises drop constraint if exists entreprises_secteurs_actifs_check;
alter table entreprises add constraint entreprises_secteurs_actifs_check
    check (secteurs_actifs <@ array['quincaillerie', 'depot_boissons', 'alimentation_generale', 'pieces_detachees', 'autre']);
