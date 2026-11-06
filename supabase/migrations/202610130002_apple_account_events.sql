-- Verified Apple events are applied only by the service endpoint. No JWTs retained.
create table public.apple_account_events (
 id_hash text primary key check(id_hash ~ '^[a-f0-9]{64}$'),
 user_id uuid references auth.users(id) on delete set null,
 event_type text not null check(event_type in ('email-enabled','email-disabled','consent-revoked','account-deleted')),
 occurred_at bigint not null check(occurred_at>0),
 received_at timestamptz not null default now()
);
create table public.apple_account_state (
 user_id uuid not null references auth.users(id) on delete cascade,
 apple_subject text not null check(length(apple_subject) between 1 and 255),
 consent_status text not null default 'active' check(consent_status in ('active','revoked','deleted')),
 consent_event_at bigint not null default 0,
 reauthenticate_after bigint not null default 0,
 relay_email text,
 forwarding_disabled boolean not null default false,
 forwarding_event_at bigint not null default 0,
 updated_at timestamptz not null default now(),
 primary key(user_id,apple_subject)
);
create index apple_account_state_relay on public.apple_account_state(relay_email) where forwarding_disabled;
alter table public.apple_account_events enable row level security;
alter table public.apple_account_state enable row level security;
revoke all on public.apple_account_events,public.apple_account_state from public,anon,authenticated;
grant select,insert,update,delete on public.apple_account_events,public.apple_account_state to service_role;

create function public.apply_rezlee_apple_event(p_id_hash text,p_subject text,p_type text,p_occurred_at bigint,p_email text default null)
returns void language plpgsql security definer set search_path='' as $$
declare owners uuid[]; owner_id uuid; identity_email text; current_state public.apple_account_state%rowtype;
begin
 if p_id_hash !~ '^[a-f0-9]{64}$' or length(p_subject) not between 1 and 255
  or p_type not in ('email-enabled','email-disabled','consent-revoked','account-deleted')
  or p_occurred_at<=0 or p_occurred_at>extract(epoch from now())+60 then raise exception 'Invalid Apple event'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id_hash,849));
 if exists(select 1 from public.apple_account_events where id_hash=p_id_hash) then return; end if;
 -- Identity ownership comes from Auth, never from the notification's email.
 select array_agg(distinct user_id) into owners from auth.identities
 where provider='apple' and identity_data->>'sub'=p_subject;
 if coalesce(cardinality(owners),0)>1 then raise exception 'Ambiguous Apple identity'; end if;
 owner_id:=owners[1];
 if owner_id is not null then
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,742));
  if not public.rezlee_account_active(owner_id) then
   -- Deletion already froze this account. Drain confirmed invalid grants without
   -- recreating account-owned state; retain only an anonymous delivery receipt.
   if p_type in ('consent-revoked','account-deleted') then
    delete from public.apple_auth_grants where user_id=owner_id and apple_subject=p_subject
     and created_at<to_timestamp(p_occurred_at+1);
   end if;
   owner_id:=null;
  end if;
 end if;
 insert into public.apple_account_events(id_hash,user_id,event_type,occurred_at)
 values(p_id_hash,owner_id,p_type,p_occurred_at);
 if owner_id is null then return; end if;
 select lower(identity_data->>'email') into identity_email from auth.identities
 where user_id=owner_id and provider='apple' and identity_data->>'sub'=p_subject limit 1;
 insert into public.apple_account_state(user_id,apple_subject) values(owner_id,p_subject) on conflict do nothing;
 select * into current_state from public.apple_account_state where user_id=owner_id and apple_subject=p_subject for update;
 if p_type in ('consent-revoked','account-deleted') then
  -- Old or duplicate events cannot re-lock sessions created after the event.
  update public.apple_account_state set
   reauthenticate_after=greatest(reauthenticate_after,p_occurred_at),
   consent_status=case when consent_event_at<=p_occurred_at then
     case when p_type='account-deleted' or consent_status='deleted' then 'deleted' else 'revoked' end else consent_status end,
   consent_event_at=greatest(consent_event_at,p_occurred_at),
   forwarding_disabled=case when forwarding_event_at<=p_occurred_at then true else forwarding_disabled end,
   forwarding_event_at=greatest(forwarding_event_at,p_occurred_at),
   relay_email=coalesce(relay_email,case when identity_email like '%@privaterelay.appleid.com' then identity_email end),updated_at=now()
  where user_id=owner_id and apple_subject=p_subject;
  -- Apple's signed revocation confirms these earlier grants are no longer usable.
  delete from public.apple_auth_grants where user_id=owner_id and apple_subject=p_subject
   and created_at<to_timestamp(p_occurred_at+1);
 elsif p_occurred_at>current_state.forwarding_event_at or (p_occurred_at=current_state.forwarding_event_at and p_type='email-disabled') then
  if p_email is null or lower(p_email)<>identity_email or p_email !~* '^[^[:space:]@]+@privaterelay\.appleid\.com$'
   then raise exception 'Apple relay identity mismatch'; end if;
  update public.apple_account_state set relay_email=lower(p_email),
   forwarding_disabled=(p_type='email-disabled' or consent_status='deleted'),
   forwarding_event_at=p_occurred_at,updated_at=now()
  where user_id=owner_id and apple_subject=p_subject;
 end if;
end $$;
revoke all on function public.apply_rezlee_apple_event(text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.apply_rezlee_apple_event(text,text,text,bigint,text) to service_role;

-- Refreshing an old access token must not bypass a revoked login: compare the
-- durable Auth session creation time, not the refreshed JWT's iat.
create function public.rezlee_session_allowed() returns boolean
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); cutoff bigint; claims jsonb; sid text; created timestamptz;
begin
 if uid is null then return false; end if;
 select max(reauthenticate_after) into cutoff from public.apple_account_state where user_id=uid;
 if coalesce(cutoff,0)=0 then return true; end if;
 begin claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb; exception when others then return false; end;
 sid:=claims->>'session_id';
 if sid is null or sid !~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then return false; end if;
 select created_at into created from auth.sessions where id=sid::uuid and user_id=uid;
 return created is not null and floor(extract(epoch from created))>cutoff;
end $$;
revoke all on function public.rezlee_session_allowed() from public,anon;
grant execute on function public.rezlee_session_allowed() to authenticated;
create function public.rezlee_mobile_access() returns text
language sql stable security definer set search_path='' as $$
 select case when not public.rezlee_account_active(auth.uid()) then 'deleting'
  when not public.rezlee_session_allowed() then 'reauthenticate' else 'active' end;
$$;
revoke all on function public.rezlee_mobile_access() from public,anon;
grant execute on function public.rezlee_mobile_access() to authenticated;

-- This only restricts the requesting session. Other household members and
-- service recovery jobs keep their own permissions and deletion protections.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='public' loop
  execute format('create policy rezlee_current_session on public.%I as restrictive for all to authenticated using ((select public.rezlee_session_allowed())) with check ((select public.rezlee_session_allowed()))',t.tablename);
 end loop;
end $$;
create policy rezlee_current_storage_session on storage.objects as restrictive for all to authenticated
 using((select public.rezlee_session_allowed())) with check((select public.rezlee_session_allowed()));

create function public.rezlee_apple_email_allowed(p_email text) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.apple_account_state where relay_email=lower(p_email) and forwarding_disabled);
$$;
revoke all on function public.rezlee_apple_email_allowed(text) from public,anon,authenticated;
grant execute on function public.rezlee_apple_email_allowed(text) to service_role;
create function public.rezlee_apple_account_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('forwardingDisabled',coalesce(bool_or(forwarding_disabled),false),
  'authorizationChanged',coalesce(bool_or(consent_status<>'active'),false))
 from public.apple_account_state where user_id=auth.uid() and public.rezlee_session_allowed();
$$;
revoke all on function public.rezlee_apple_account_status() from public,anon;
grant execute on function public.rezlee_apple_account_status() to authenticated;
notify pgrst,'reload schema';

-- Install as PostgREST's db_pre_request only after checking/preserving any
-- existing hook in the target project. This fences SECURITY DEFINER RPCs too.
-- Storage still uses the restrictive RLS policy above.
create function public.check_rezlee_session() returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is not null and not public.rezlee_session_allowed() then
  raise sqlstate 'PT401' using message='Your sign-in changed. Please sign in again.';
 end if;
end $$;
revoke all on function public.check_rezlee_session() from public;
grant execute on function public.check_rezlee_session() to anon,authenticated,service_role;
notify pgrst,'reload schema';

create trigger guard_deleting_account before insert or update on public.apple_account_events
 for each row execute function public.guard_deleting_rezlee_account();
create trigger guard_deleting_account before insert or update on public.apple_account_state
 for each row execute function public.guard_deleting_rezlee_account();
