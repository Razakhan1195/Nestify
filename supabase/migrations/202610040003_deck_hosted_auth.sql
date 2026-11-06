-- Server-owned, resumable hosted credential handoffs. No passwords or Deck tokens.
create table public.deck_hosted_auth_intents (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 home_id uuid not null references public.homes(id) on delete cascade,
 registry_id uuid not null references public.provider_registry(id),
 provider_id uuid not null,
 existing_provider boolean not null default false,
 previous_credential_id text,
 account_number text,
 source_id text not null,
 credential_id text,
 status text not null default 'pending' check(status in ('pending','completed','canceled','expired')),
 expires_at timestamptz not null default now()+interval '30 minutes',
 next_attempt_at timestamptz not null default now(),
 lease_id uuid, lease_until timestamptz, cleanup_finished_at timestamptz,
 token_count integer not null default 0 check(token_count between 0 and 5),
 created_at timestamptz not null default now(), completed_at timestamptz
);
create unique index deck_hosted_auth_pending_user on public.deck_hosted_auth_intents(user_id,registry_id) where status='pending';
create index deck_hosted_auth_recovery on public.deck_hosted_auth_intents(next_attempt_at) where status='pending';
alter table public.deck_hosted_auth_intents enable row level security;
revoke all on public.deck_hosted_auth_intents from public,anon,authenticated;
grant all on public.deck_hosted_auth_intents to service_role;
create trigger guard_deleting_account before insert or update on public.deck_hosted_auth_intents for each row execute function public.guard_deleting_rezlee_account();

-- The temporary external ID is user_id:intent_id; retain it in the existing
-- deletion journal even when the app closes before receiving a credential ID.
create function public.remember_rezlee_hosted_intent() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 insert into public.account_deck_providers(user_id,provider_id) values(new.user_id,new.id) on conflict do nothing;
 return new;
end $$;
create trigger remember_hosted_intent after insert on public.deck_hosted_auth_intents for each row execute function public.remember_rezlee_hosted_intent();

alter table public.deck_telecom_imports add column hosted_auth_id uuid references public.deck_hosted_auth_intents(id) on delete set null;
create unique index deck_telecom_hosted_once on public.deck_telecom_imports(hosted_auth_id) where hosted_auth_id is not null;

-- Explicit disconnection wins over a delayed hosted success or recovery worker.
create function public.cancel_rezlee_hosted_on_disconnect() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if new.connection_status='disconnected' and old.connection_status is distinct from new.connection_status then
  update public.deck_hosted_auth_intents set status='canceled' where provider_id=new.id and user_id=new.user_id and status='pending';
 end if;
 return new;
end $$;
create trigger cancel_hosted_on_disconnect after update of connection_status on public.providers for each row execute function public.cancel_rezlee_hosted_on_disconnect();
revoke all on function public.remember_rezlee_hosted_intent() from public,anon,authenticated;
revoke all on function public.cancel_rezlee_hosted_on_disconnect() from public,anon,authenticated;

-- Provider lock orders this handoff with disconnection; the browser callback
-- cannot resurrect a connection after the customer has disconnected it.
create function public.queue_rezlee_hosted_import(p_intent uuid,p_credential text,p_job uuid,p_metadata jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare i public.deck_hosted_auth_intents%rowtype; p public.providers%rowtype;
begin
 select * into i from public.deck_hosted_auth_intents where id=p_intent;
 if not found then return false; end if;
 select * into p from public.providers where id=i.provider_id and user_id=i.user_id for update;
 if not found then return false; end if;
 select * into i from public.deck_hosted_auth_intents where id=p_intent for update;
 if i.status<>'pending' or i.credential_id is distinct from p_credential or not public.rezlee_account_active(i.user_id)
 or (p.deck_credential_id is distinct from i.previous_credential_id and p.deck_credential_id is distinct from p_credential)
 or not exists(select 1 from public.deck_telecom_imports where id=p_job and hosted_auth_id=i.id and user_id=i.user_id and provider_id=p.id) then return false; end if;
 update public.providers set deck_credential_id=p_credential,deck_session_id=null,deck_connection_status='queued',connection_status='syncing',health_status='healthy',sync_status='initial_sync_pending',sync_failure_reason=null,requires_user_action=false,user_action_message=null,deck_connection_metadata=p_metadata where id=p.id;
 update public.deck_telecom_imports set credential_id=p_credential,status='queued',message='Checking your Rogers connection. Your bills will follow.' where id=p_job;
 return true;
end $$;
revoke all on function public.queue_rezlee_hosted_import(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.queue_rezlee_hosted_import(uuid,text,uuid,jsonb) to service_role;
