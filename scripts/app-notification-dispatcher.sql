-- Staging only; resumes delivery of notifications derived from saved data.
select cron.schedule('rezlee-app-notifications','*/5 * * * *',$dispatch$
 select net.http_post(
  url:='https://staging.rezlee.com/api/notifications/dispatch',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='rezlee_app_notification_worker_secret' limit 1)),
  body:='{}'::jsonb,timeout_milliseconds:=10000);
$dispatch$);
