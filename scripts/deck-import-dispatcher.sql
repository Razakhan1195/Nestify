-- Run only on the approved staging rollout after deploying /api/deck/recover-imports.
-- Prerequisites: pg_cron + pg_net and a Supabase Vault secret named
-- rezlee_deck_import_worker_secret matching server DECK_IMPORT_WORKER_SECRET.
-- This resumes customer-started jobs and notification retries only; it never starts a scheduled import.
select cron.schedule('rezlee-pending-deck-imports', '* * * * *', $dispatcher$
 select net.http_post(
  url := 'https://staging.rezlee.com/api/deck/recover-imports',
  headers := jsonb_build_object('Content-Type','application/json','Authorization',
   'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='rezlee_deck_import_worker_secret' limit 1)),
  body := '{}'::jsonb,
  timeout_milliseconds := 10000
 );
$dispatcher$);
