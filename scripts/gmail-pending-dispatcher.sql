-- Operational setup only; no customer schema changes. Requires pg_net, pg_cron,
-- and two separately provisioned Vault secrets. Does not start new searches.
create or replace function public.dispatch_rezlee_pending_gmail() returns integer
language plpgsql security definer set search_path='' as $$
declare target text; token text; r record; sent integer:=0;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('rezlee-gmail-dispatch',743)) then return 0;end if;
 select decrypted_secret into target from vault.decrypted_secrets where name='rezlee_gmail_pending_origin';
 select decrypted_secret into token from vault.decrypted_secrets where name='rezlee_gmail_pending_token';
 -- This release enables staging only. Production requires a separate reviewed rollout.
 if target is distinct from 'https://staging.rezlee.com' or token is null then return 0;end if;
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
revoke all on function public.dispatch_rezlee_pending_gmail() from public,anon,authenticated,service_role;
select cron.schedule('rezlee-gmail-pending-imports','* * * * *','select public.dispatch_rezlee_pending_gmail();');
