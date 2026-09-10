-- =====================================================================
-- MIGRATION : NOTIFICATIONS D'ABONNEMENT (EMAIL VIA BREVO)
-- À exécuter après migration_admin.sql.
--
-- PRÉ-REQUIS AVANT D'EXÉCUTER CE FICHIER :
-- Dans Supabase > Database > Extensions, active (toggle) :
--   - pg_cron
--   - pg_net
-- =====================================================================

-- Empêche de renvoyer la même alerte plusieurs fois le même jour.
alter table entreprises
    add column if not exists derniere_alerte_envoyee date;

-- ---------------------------------------------------------------------
-- TÂCHE PLANIFIÉE : tous les jours à 7h UTC (8h au Bénin), on appelle
-- l'Edge Function verifier-abonnements-expiration.
--
-- IMPORTANT : remplace les deux valeurs ci-dessous avant d'exécuter :
--   1. TON_PROJECT_REF (visible dans ton URL Supabase, ex: pinepbsrsjdroijrdxzo)
--   2. LA_VALEUR_DE_CRON_SECRET (choisis une chaîne aléatoire longue,
--      la MÊME que celle définie via `supabase secrets set CRON_SECRET=...`)
-- ---------------------------------------------------------------------
select cron.schedule(
    'verifier-abonnements-quotidien',
    '0 7 * * *',
    $$
    select net.http_post(
        url := 'https://pinepbsrsjdroijrdxzo.supabase.co/functions/v1/verifier-abonnements-expiration',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', 'mon_saas_changera_ma_situation_financiere'
        ),
        body := '{}'::jsonb
    );
    $$
);

-- Pour vérifier que la tâche est bien programmée :
-- select * from cron.job;

-- Pour la supprimer si besoin de la recréer avec d'autres valeurs :
-- select cron.unschedule('verifier-abonnements-quotidien');
