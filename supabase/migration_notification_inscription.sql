-- =====================================================================
-- MIGRATION : NOTIFICATION ADMIN — NOUVELLE INSCRIPTION
-- À exécuter après migration_secteur_activite.sql.
--
-- PRÉ-REQUIS :
--   - pg_net déjà activé (voir migration_notifications.sql)
--   - Le secret CRON_SECRET déjà défini côté Edge Functions
--     (`supabase secrets set CRON_SECRET=...`) — on réutilise la même
--     valeur pour authentifier cet appel, pas besoin d'en créer un autre
--   - Avant d'exécuter ce fichier, remplace ci-dessous :
--       1. TON_PROJECT_REF (ex: pinepbsrsjdroijrdxzo)
--       2. LA_VALEUR_DE_CRON_SECRET (la même que celle définie pour
--          verifier-abonnements-expiration)
--   - Déploie aussi la nouvelle Edge Function :
--       supabase functions deploy notifier-nouvelle-inscription
-- =====================================================================

create or replace function notifier_admin_nouvelle_inscription()
returns trigger
language plpgsql
security definer
as $$
begin
    perform net.http_post(
        url := 'https://TON_PROJECT_REF.supabase.co/functions/v1/notifier-nouvelle-inscription',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-webhook-secret', 'LA_VALEUR_DE_CRON_SECRET'
        ),
        body := jsonb_build_object(
            'entreprise_id', NEW.id,
            'nom', NEW.nom,
            'secteur_activite', NEW.secteur_activite,
            'secteur_activite_autre', NEW.secteur_activite_autre,
            'telephone', NEW.telephone,
            'regime_fiscal', NEW.regime_fiscal,
            'created_at', NEW.created_at
        )
    );
    return NEW;
end;
$$;

drop trigger if exists trg_notifier_nouvelle_inscription on entreprises;
create trigger trg_notifier_nouvelle_inscription
    after insert on entreprises
    for each row
    execute function notifier_admin_nouvelle_inscription();
