-- Additive, server-owned deletion journal. Apply before enabling ACCOUNT_DELETION_ENABLED.
-- No utility scheduling is enabled. Completion receipts survive Auth deletion for 14 days.
create table public.account_deletion_jobs (
 id uuid primary key,
 user_id uuid unique, -- deliberately no FK: deleting Auth must not destroy the job/receipt
 receipt_hash text not null check (receipt_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'queued' check (status in ('queued','running','retry','needs_attention','completed')),
 phase text not null default 'connections' check (phase in ('connections','files','account')),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 lease_id uuid, lease_until timestamptz,
 error_code text,
 created_at timestamptz not null default now(), completed_at timestamptz
);
create index account_deletion_due_idx on public.account_deletion_jobs(next_attempt_at)
 where status in ('queued','retry','running');
create table public.account_deletion_resources (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.account_deletion_jobs(id) on delete cascade,
 kind text not null check(kind in ('deck','ezgb','review')),
 external_id text not null, provider_id uuid,
 done boolean not null default false,
 unique(job_id,kind,external_id)
);
create table public.account_operation_leases (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null default now() + interval '1 hour'
);
create index account_operation_user_idx on public.account_operation_leases(user_id,expires_at);
create table public.account_deck_providers (
 user_id uuid not null references auth.users(id) on delete cascade,
 provider_id uuid not null, -- no provider FK: a removed provider may still hold vendor credentials
 primary key(user_id,provider_id)
);
-- Non-sensitive run identifiers prevent late Deck webhook payloads being retained again.
create table public.deleted_deck_runs (task_run_id text primary key, created_at timestamptz not null default now());

do $$ declare t text; begin
 foreach t in array array['account_deletion_jobs','account_deletion_resources','account_operation_leases','account_deck_providers','deleted_deck_runs'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public, anon, authenticated',t);
 end loop;
end $$;

create function public.rezlee_account_active(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=p_user)
 and not exists(select 1 from public.account_deletion_jobs where user_id=p_user);
$$;
revoke all on function public.rezlee_account_active(uuid) from public, anon;
grant execute on function public.rezlee_account_active(uuid) to authenticated;

-- Freeze all user access, including an already-issued JWT and shared household reads.
-- This adds a restriction; it never grants access to an otherwise forbidden row.
do $$ declare t record; guard text; begin
 for t in select tablename from pg_tables where schemaname='public'
 and tablename not in ('account_deletion_jobs','account_deletion_resources','account_operation_leases','account_deck_providers','deleted_deck_runs') loop
  guard := 'public.rezlee_account_active(auth.uid())';
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name=t.tablename and column_name='user_id') then
   guard := guard || ' and (user_id is null or public.rezlee_account_active(user_id))';
  elsif exists(select 1 from information_schema.columns where table_schema='public' and table_name=t.tablename and column_name='created_by_user_id') then
   guard := guard || ' and public.rezlee_account_active(created_by_user_id)';
  end if;
  execute format('create policy rezlee_active_accounts on public.%I as restrictive for all to authenticated using (%s) with check (%s)',t.tablename,guard,guard);
 end loop;
end $$;
create policy rezlee_active_storage on storage.objects as restrictive for all to authenticated
 using(public.rezlee_account_active(auth.uid())) with check(public.rezlee_account_active(auth.uid()));

-- Service jobs also cannot recreate rows while deletion is pending. Serialize each
-- owned write with request creation so the cleanup snapshot cannot miss a commit.
create function public.guard_deleting_rezlee_account() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid; record_json jsonb := to_jsonb(new);
begin
 if tg_op='UPDATE' and pg_trigger_depth()>1 and
  (to_jsonb(new)-'assigned_member_id'-'rotation_id'-'linked_user_id'-'updated_at') =
  (to_jsonb(old)-'assigned_member_id'-'rotation_id'-'linked_user_id'-'updated_at') then return new; end if;
 target := coalesce((record_json->>'user_id')::uuid,(record_json->>'created_by_user_id')::uuid);
 if target is not null then
  perform pg_advisory_xact_lock(hashtextextended(target::text, 742));
  if not public.rezlee_account_active(target) then raise exception 'Account is being deleted' using errcode='42501'; end if;
 end if;
 return new;
end $$;
do $$ declare t record; begin
 for t in select distinct table_name from information_schema.columns where table_schema='public'
 and column_name in ('user_id','created_by_user_id')
 and table_name not in ('account_deletion_jobs','account_operation_leases','account_deck_providers') loop
  execute format('create trigger guard_deleting_account before insert or update on public.%I for each row execute function public.guard_deleting_rezlee_account()',t.table_name);
 end loop;
end $$;

create function public.start_rezlee_account_operation(p_user uuid) returns uuid
language plpgsql security definer set search_path='' as $$ declare operation_id uuid; begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,742));
 if not public.rezlee_account_active(p_user) then raise exception 'Account unavailable' using errcode='42501'; end if;
 insert into public.account_operation_leases(user_id) values(p_user) returning id into operation_id;
 return operation_id;
end $$;

create function public.remember_rezlee_deck_provider(p_user uuid,p_provider uuid) returns void
language plpgsql security definer set search_path='' as $$ begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,742));
 if not public.rezlee_account_active(p_user) or not exists(select 1 from public.providers where id=p_provider and user_id=p_user) then
  raise exception 'Provider unavailable' using errcode='42501';
 end if;
 insert into public.account_deck_providers values(p_user,p_provider) on conflict do nothing;
end $$;

create function public.begin_rezlee_account_deletion(p_user uuid,p_id uuid,p_receipt_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.account_deletion_jobs%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,742));
 select * into job from public.account_deletion_jobs where user_id=p_user;
 if found then
  if job.id<>p_id then raise exception 'Deletion already requested' using errcode='23505'; end if;
  if job.receipt_hash<>p_receipt_hash then
   update public.account_deletion_jobs set receipt_hash=p_receipt_hash where id=p_id returning * into job;
  end if;
  return to_jsonb(job);
 end if;
 if not exists(select 1 from auth.users where id=p_user) then raise exception 'Account not found' using errcode='42501'; end if;
 if exists(select 1 from public.account_operation_leases where user_id=p_user and expires_at>now()) then
  raise exception 'An account operation is still running' using errcode='55000';
 end if;
 -- Stop pending notifications/scheduling before the write freeze is installed.
 update public.providers set next_scheduled_sync_at=null where user_id=p_user;
 update public.provider_integrations set metadata=jsonb_set(metadata,'{next_refresh_at}','"9999-12-31T00:00:00Z"'::jsonb) where user_id=p_user;
 update public.device_push_tokens set enabled=false where user_id=p_user;
 update public.recall_preferences set enabled=false where user_id=p_user;
 insert into public.account_deletion_jobs(id,user_id,receipt_hash) values(p_id,p_user,p_receipt_hash) returning * into job;
 insert into public.account_deletion_resources(job_id,kind,external_id,provider_id)
 select p_id,'deck',p.id::text,p.id from public.providers p where p.user_id=p_user
 and (p.deck_credential_id is not null or p.deck_connection_metadata->>'credentialId' like 'cred_%');
 insert into public.account_deletion_resources(job_id,kind,external_id,provider_id)
 select p_id,'deck',provider_id::text,provider_id from public.account_deck_providers where user_id=p_user
 on conflict do nothing;
 insert into public.account_deletion_resources(job_id,kind,external_id)
 select distinct p_id,'ezgb',external_authorization_id from public.provider_integrations
 where user_id=p_user and adapter='ezgb' and external_authorization_id is not null and status<>'disconnected';
 insert into public.account_deletion_resources(job_id,kind,external_id)
 select p_id,'review','unverified-integration' where exists(
  select 1 from public.provider_integrations where user_id=p_user and status<>'disconnected'
  and (adapter<>'ezgb' or external_authorization_id is null)
 ) or exists(
  select 1 from public.providers where user_id=p_user and deck_connection_id is not null
  and deck_credential_id is null and coalesce(deck_connection_metadata->>'credentialId','') not like 'cred_%'
  and connection_status<>'disconnected'
 );
 insert into public.deleted_deck_runs(task_run_id)
 select distinct deck_task_run_id from public.provider_sync_runs where user_id=p_user and deck_task_run_id is not null
 on conflict do nothing;
 delete from public.deck_events where task_run_id in (select deck_task_run_id from public.provider_sync_runs where user_id=p_user);
 return to_jsonb(job);
end $$;

create function public.claim_rezlee_account_deletion(p_id uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ declare job public.account_deletion_jobs%rowtype; begin
 update public.account_deletion_jobs set status='needs_attention',error_code='account_unavailable',lease_id=null,lease_until=null
 where id=p_id and attempts>=5 and status in ('queued','retry','running') and (lease_until is null or lease_until<now());
 update public.account_deletion_jobs set status='running',lease_id=p_lease,lease_until=now()+interval '3 minutes',attempts=attempts+1
 where id=p_id and status in ('queued','retry','running') and next_attempt_at<=now()
 and (lease_until is null or lease_until<now()) returning * into job;
 if not found then return null; end if;
 return to_jsonb(job);
end $$;

-- Read-only metadata query; actual bytes must be removed using the Storage API.
create function public.rezlee_deletion_file_batch(p_user uuid) returns table(name text)
language sql stable security definer set search_path='' as $$
 select o.name from storage.objects o where o.bucket_id='rezlee-documents'
 and o.name like p_user::text || '/%' order by o.name limit 100;
$$;

create function public.clean_rezlee_account_links(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$ begin
 if not exists(select 1 from public.account_deletion_jobs where user_id=p_user and phase='account') then raise exception 'No deletion in progress'; end if;
 -- A former member's name/email must not survive as a local member. Other homes
 -- and their tasks remain; FK SET NULL unassigns work and cascades rotation slots.
 delete from public.household_members where linked_user_id=p_user;
 delete from public.deck_events where task_run_id in
   (select deck_task_run_id from public.provider_sync_runs where user_id=p_user);
end $$;

create function public.guard_deleted_deck_event() returns trigger
language plpgsql security definer set search_path='' as $$ declare target uuid; begin
 select user_id into target from public.provider_sync_runs where deck_task_run_id=new.task_run_id limit 1;
 if target is not null then perform pg_advisory_xact_lock(hashtextextended(target::text,742)); end if;
 if exists(select 1 from public.deleted_deck_runs where task_run_id=new.task_run_id) then return null; end if;
 return new;
end $$;
create trigger guard_deleted_deck_event before insert or update on public.deck_events
 for each row execute function public.guard_deleted_deck_event();

-- Guard late signed uploads too. DELETE remains allowed for the Storage service.
create function public.guard_deleting_rezlee_storage() returns trigger
language plpgsql security definer set search_path='' as $$ declare target uuid; begin
 if new.bucket_id='rezlee-documents' and split_part(new.name,'/',1) ~ '^[a-f0-9-]{36}$' then
  target := split_part(new.name,'/',1)::uuid;
  perform pg_advisory_xact_lock(hashtextextended(target::text,742));
  if not public.rezlee_account_active(target) then raise exception 'Account unavailable' using errcode='42501'; end if;
 end if;
 return new;
end $$;
create trigger guard_deleting_account_storage before insert or update on storage.objects
 for each row execute function public.guard_deleting_rezlee_storage();

-- No end-user RPC can select another deletion target or acquire a worker lease.
do $$ declare signature text; t text; begin
 foreach signature in array array[
  'remember_rezlee_deck_provider(uuid,uuid)','start_rezlee_account_operation(uuid)','begin_rezlee_account_deletion(uuid,uuid,text)',
  'claim_rezlee_account_deletion(uuid,uuid)','rezlee_deletion_file_batch(uuid)','clean_rezlee_account_links(uuid)',
  'guard_deleting_rezlee_account()','guard_deleting_rezlee_storage()','guard_deleted_deck_event()'
 ] loop
  execute 'revoke all on function public.'||signature||' from public, anon, authenticated';
  if exists(select 1 from pg_roles where rolname='service_role') then
   execute 'grant execute on function public.'||signature||' to service_role';
  end if;
 end loop;
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant execute on function public.rezlee_account_active(uuid) to service_role;
  foreach t in array array['account_deletion_jobs','account_deletion_resources','account_operation_leases','account_deck_providers','deleted_deck_runs'] loop
   execute format('grant all on public.%I to service_role',t);
  end loop;
 end if;
end $$;
notify pgrst,'reload schema';
