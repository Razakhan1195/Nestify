-- Install the recovery function; schedule activation is a separate staging-only
-- deployment action after auth/storage acceptance. No utility or Gmail searches.
create or replace function public.enqueue_rezlee_account_deletion_recovery()
returns bigint language plpgsql security definer set search_path='' as $$
declare worker_secret text; worker_time text; worker_signature text;
begin
 select decrypted_secret into worker_secret from vault.decrypted_secrets where name='rezlee_app_notification_worker_secret';
 if worker_secret is null or length(worker_secret)<32 then raise exception 'Scheduler unavailable'; end if;
 worker_time := floor(extract(epoch from clock_timestamp()))::bigint::text;
 worker_signature := encode(extensions.hmac('rezlee-account-deletion-v1:'||worker_time,worker_secret,'sha256'),'hex');
 return net.http_get(
  url := 'https://staging.rezlee.com/api/account-deletion/worker',
  headers := jsonb_build_object('x-rezlee-deletion-time',worker_time,'x-rezlee-deletion-signature',worker_signature),
  timeout_milliseconds := 90000
 );
end $$;
revoke all on function public.enqueue_rezlee_account_deletion_recovery() from public,anon,authenticated;
grant execute on function public.enqueue_rezlee_account_deletion_recovery() to service_role;
-- Deliberately no cron.schedule here: do not silently enable in production.
