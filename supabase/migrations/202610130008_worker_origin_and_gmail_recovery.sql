-- Worker activation is an explicit environment configuration, never a staging
-- URL copied into production. No cron jobs or discovery work are enabled here.
create or replace function public.enqueue_rezlee_account_deletion_recovery()
returns bigint language plpgsql security definer set search_path='' as $$
declare worker_secret text; worker_time text; worker_signature text; target text;
begin
 select decrypted_secret into target from vault.decrypted_secrets where name='rezlee_worker_origin';
 if target is null or target not in ('https://staging.rezlee.com','https://rezlee.com') then return 0;end if;
 select decrypted_secret into worker_secret from vault.decrypted_secrets where name='rezlee_app_notification_worker_secret';
 if worker_secret is null or length(worker_secret)<32 then raise exception 'Scheduler unavailable';end if;
 worker_time:=floor(extract(epoch from clock_timestamp()))::bigint::text;
 worker_signature:=encode(extensions.hmac('rezlee-account-deletion-v1:'||worker_time,worker_secret,'sha256'),'hex');
 return net.http_get(url:=target||'/api/account-deletion/worker',headers:=jsonb_build_object('x-rezlee-deletion-time',worker_time,'x-rezlee-deletion-signature',worker_signature),timeout_milliseconds:=90000);
end $$;
revoke all on function public.enqueue_rezlee_account_deletion_recovery() from public,anon,authenticated;
grant execute on function public.enqueue_rezlee_account_deletion_recovery() to service_role;

-- Previously installed as a staging operational command. Keep the bounded
-- recovery of already-started Gmail work reproducible, independently of discovery.
create or replace function public.dispatch_rezlee_pending_gmail()
returns integer language plpgsql security definer set search_path='' as $$
declare target text; token text; r record; sent integer:=0;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('rezlee-gmail-dispatch',743)) then return 0;end if;
 select decrypted_secret into target from vault.decrypted_secrets where name='rezlee_gmail_pending_origin';
 select decrypted_secret into token from vault.decrypted_secrets where name='rezlee_gmail_pending_token';
 if target is null or target not in ('https://staging.rezlee.com','https://rezlee.com') or token is null or length(token)<32 then return 0;end if;
 for r in select g.id from public.gmail_memory_links g
 where g.status='active' and g.token_cipher is not null and g.work->>'phase' in ('search','read')
 and g.next_run<=now() and (g.lease_until is null or g.lease_until<now())
 and coalesce((g.work->>'retryAt')::timestamptz,now())<=now()
 and public.rezlee_account_active(g.user_id)
 and exists(select 1 from public.homes h where h.id=g.home_id and h.user_id=g.user_id)
 order by g.next_run limit 3
 loop
  perform net.http_post(url:=target||'/api/integrations/gmail/worker',headers:=jsonb_build_object('Authorization','Bearer '||token,'Content-Type','application/json'),body:=jsonb_build_object('id',r.id),timeout_milliseconds:=5000);
  sent:=sent+1;
 end loop;
 return sent;
end $$;
revoke all on function public.dispatch_rezlee_pending_gmail() from public,anon,authenticated;
grant execute on function public.dispatch_rezlee_pending_gmail() to service_role;
-- Vault origin/secret configuration and cron activation are separately reviewed.
