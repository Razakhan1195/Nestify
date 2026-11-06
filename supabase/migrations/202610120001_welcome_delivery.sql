-- One welcome per newly verified account. No trigger, backfill or schedule.
begin;
create table public.welcome_email_deliveries (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references auth.users(id) on delete cascade,
 recipient_email text not null,
 payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','sending','retry','accepted','uncertain','suppressed','failed')),
 attempts integer not null default 0,
 lease_id uuid,
 first_attempt_at timestamptz,
 last_attempt_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 provider_id text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.welcome_email_deliveries enable row level security;
revoke all on public.welcome_email_deliveries from public,anon,authenticated;
grant all on public.welcome_email_deliveries to service_role;

create function public.claim_rezlee_welcome(p_user uuid,p_start timestamptz,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare account jsonb; delivery public.welcome_email_deliveries%rowtype; lease uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,742));
 if not public.rezlee_account_active(p_user) then return jsonb_build_object('state','ineligible'); end if;
 select to_jsonb(u) into account from auth.users u where id=p_user;
 if p_start is null or p_start>now() or (account->>'created_at')::timestamptz<p_start
  or account->>'created_at' is null or account->>'email_confirmed_at' is null
  or coalesce(account->>'email','')='' then return jsonb_build_object('state','ineligible'); end if;
 -- The snapshot is supplied by the server, never by an app request body.
 if jsonb_typeof(p_payload->'to') is distinct from 'array' or jsonb_array_length(p_payload->'to')<>1
  or lower(p_payload->'to'->>0) is distinct from lower(account->>'email')
  or coalesce(p_payload->>'subject','')='' then raise exception 'Invalid welcome message'; end if;
 insert into public.welcome_email_deliveries(user_id,recipient_email,payload)
 values(p_user,account->>'email',p_payload) on conflict(user_id) do nothing;
 select * into delivery from public.welcome_email_deliveries where user_id=p_user for update;
 if delivery.status in ('accepted','uncertain','suppressed','failed') then return jsonb_build_object('state',delivery.status); end if;
 if lower(delivery.recipient_email)<>lower(account->>'email') then
  update public.welcome_email_deliveries set status='suppressed',updated_at=now() where id=delivery.id;
  return jsonb_build_object('state','suppressed');
 end if;
 if delivery.next_attempt_at>now() or (delivery.status='sending' and delivery.last_attempt_at>now()-interval '2 minutes') then
  return jsonb_build_object('state','waiting');
 end if;
 -- All retries keep the original payload/key, inside Resend's 24-hour window.
 if delivery.first_attempt_at<now()-interval '23 hours' or delivery.attempts>=5 then
  update public.welcome_email_deliveries set status='uncertain',updated_at=now() where id=delivery.id;
  return jsonb_build_object('state','uncertain');
 end if;
 lease:=gen_random_uuid();
 insert into public.account_operation_leases(id,user_id,expires_at) values(lease,p_user,now()+interval '2 minutes');
 update public.welcome_email_deliveries set status='sending',attempts=attempts+1,lease_id=lease,
  first_attempt_at=coalesce(first_attempt_at,now()),last_attempt_at=now(),updated_at=now()
 where id=delivery.id returning * into delivery;
 return jsonb_build_object('state','claimed','id',delivery.id,'leaseId',lease,'payload',delivery.payload);
end $$;

create function public.finish_rezlee_welcome(p_user uuid,p_lease uuid,p_status text,p_provider_id text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 if p_status not in ('accepted','retry','failed','uncertain','suppressed') then raise exception 'Invalid welcome result'; end if;
 update public.welcome_email_deliveries set status=p_status,provider_id=p_provider_id,
  next_attempt_at=now()+interval '5 minutes',lease_id=null,updated_at=now()
 where user_id=p_user and lease_id=p_lease and status='sending';
 get diagnostics changed=row_count;
 delete from public.account_operation_leases where id=p_lease and user_id=p_user;
 return changed=1;
end $$;
revoke all on function public.claim_rezlee_welcome(uuid,timestamptz,jsonb),public.finish_rezlee_welcome(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_rezlee_welcome(uuid,timestamptz,jsonb),public.finish_rezlee_welcome(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
