-- Additive launch operations and membership ledger. Customer roles cannot grant access.
create table public.rezlee_membership_campaign (
 singleton boolean primary key default true check(singleton),
 activated integer not null default 0 check(activated between 0 and 1000),
 waitlist_cutoff_at timestamptz -- Set only when the published waitlist offer actually closes.
);
insert into public.rezlee_membership_campaign(singleton) values(true);
create table public.rezlee_member_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), founder_seen_at timestamptz
);
create table public.rezlee_founder_allocations (
 id bigint generated always as identity primary key,
 user_id uuid unique references auth.users(id) on delete set null,
 slot integer unique check(slot between 1 and 1000),
 reason text not null check(reason in ('waitlist','first_1000')),
 created_at timestamptz not null default now()
);
create table public.rezlee_entitlements (
 user_id uuid not null references auth.users(id) on delete cascade,
 source text not null check(source in ('founder','store','goodwill')),
 expires_at timestamptz,
 verified_at timestamptz not null default now(),
 product_id text,
 primary key(user_id,source),
 check(source='founder' or expires_at is not null)
);
create table public.rezlee_feature_usage (
 user_id uuid not null references auth.users(id) on delete cascade,
 feature text not null check(feature in ('document','assistant')),
 month date not null, used integer not null default 0 check(used>=0),
 primary key(user_id,feature,month)
);
create table public.rezlee_store_sync (
 user_id uuid primary key references auth.users(id) on delete cascade,
 lease_id uuid, lease_until timestamptz, checked_at timestamptz
);
create table public.rezlee_support_audit (
 id bigint generated always as identity primary key,
 operator_id uuid not null,
 customer_id uuid references auth.users(id) on delete set null,
 action text not null, reference text, reason text,
 created_at timestamptz not null default now()
);
create table public.rezlee_support_cases (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid references auth.users(id) on delete set null,
 subject text not null check(length(subject) between 3 and 160),
 note text not null default '' check(length(note)<=2000),
 status text not null default 'open' check(status in ('open','investigating','waiting_customer','waiting_provider','resolved')),
 assigned_to uuid, revision integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index rezlee_support_cases_queue on public.rezlee_support_cases(status,updated_at,id);
create table public.rezlee_provider_controls (
 provider_key text primary key check(length(provider_key) between 8 and 120),
 paused boolean not null default false,
 evidence text not null default 'configured' check(evidence in ('configured','sandbox_verified','live_verified')),
 evidence_reference text,
 verified_at timestamptz, updated_at timestamptz not null default now(),
 revision integer not null default 1
);
create table public.rezlee_vendor_reviews (
 vendor text primary key check(vendor in ('vercel','supabase','resend','deck','ezgb','google_oauth','ai','expo','sentry','revenuecat')),
 status text not null check(status in ('unverified','ready','attention','blocked')),
 plan text not null default '', limit_notes text not null default '',
 owner_id uuid, reviewed_at timestamptz not null default now(),
 review_before timestamptz not null, revision integer not null default 1,
 check(length(plan)<=120 and length(limit_notes)<=1500)
);
do $$ declare t text; begin
 foreach t in array array['rezlee_membership_campaign','rezlee_member_accounts','rezlee_founder_allocations','rezlee_entitlements','rezlee_feature_usage','rezlee_store_sync','rezlee_support_audit','rezlee_support_cases','rezlee_provider_controls','rezlee_vendor_reviews'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant usage,select on sequence public.rezlee_founder_allocations_id_seq,public.rezlee_support_audit_id_seq to service_role;

create function public.rezlee_activate_member(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u auth.users; c public.rezlee_membership_campaign; n integer; eligible boolean;
begin
 if not public.rezlee_account_active(p_user) then raise exception 'Account unavailable' using errcode='PT423';end if;
 select * into u from auth.users where id=p_user;
 if not found or u.email_confirmed_at is null or u.email is null then raise exception 'Verify email first' using errcode='PT403';end if;
 perform pg_advisory_xact_lock(hashtextextended('rezlee-founder-activation-v1',16012026));
 if exists(select 1 from public.rezlee_member_accounts where user_id=p_user) then return;end if;
 select * into c from public.rezlee_membership_campaign where singleton for update;
 if not found then raise exception 'Membership unavailable';end if;
 -- Previously reserved waitlist promises survive marketing unsubscription.
 select exists(select 1 from public.rezlee_waitlist w where
 w.email=lower(trim(u.email)) and w.slot is not null and (c.waitlist_cutoff_at is null or w.created_at<=c.waitlist_cutoff_at)) into eligible;
 if c.activated<1000 then
 n:=c.activated+1;
 update public.rezlee_membership_campaign set activated=n where singleton;
 end if;
 insert into public.rezlee_member_accounts(user_id) values(p_user);
 if eligible or n is not null then
 insert into public.rezlee_founder_allocations(user_id,slot,reason) values(p_user,n,case when eligible then 'waitlist' else 'first_1000' end);
 insert into public.rezlee_entitlements(user_id,source) values(p_user,'founder') on conflict do nothing;
 end if;
end $$;

create function public.rezlee_membership(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.rezlee_entitlements; h uuid; sponsor uuid; seen timestamptz; own_lifetime boolean;
begin
 if not public.rezlee_account_active(p_user) then raise exception 'Account unavailable' using errcode='PT423';end if;
 select id,user_id into h,sponsor from public.homes where user_id=p_user order by created_at,id limit 1;
 if h is null then
 select hm.home_id,homes.user_id into h,sponsor from public.household_members hm join public.homes on homes.id=hm.home_id
 where hm.linked_user_id=p_user and hm.status='active' order by hm.created_at,hm.id limit 1;
 end if;
 own_lifetime:=exists(select 1 from public.rezlee_entitlements where user_id=p_user and source='founder');
 select * into e from public.rezlee_entitlements where (user_id=p_user or user_id=sponsor)
 and (source='founder' or expires_at>now())
 order by (source='founder') desc,expires_at desc nulls first limit 1;
 select founder_seen_at into seen from public.rezlee_member_accounts where user_id=p_user;
 return jsonb_build_object('plan',case when e.user_id is null then 'free' else 'pro' end,
 'source',e.source,'expiresAt',e.expires_at,'lifetime',own_lifetime,'household',e.user_id is not null and e.user_id<>p_user,
 'homeId',h,'founderSeen',seen is not null,'activated',exists(select 1 from public.rezlee_member_accounts where user_id=p_user));
end $$;

create function public.rezlee_reserve_feature(p_user uuid,p_feature text) returns text
language plpgsql security definer set search_path='' as $$
declare m date:=date_trunc('month',now() at time zone 'UTC')::date; cap integer; n integer; pro boolean;
begin
 if p_feature not in ('document','assistant') or p_feature is null then return 'unavailable';end if;
 if not public.rezlee_account_active(p_user) then return 'unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text||p_feature,16012026));
 pro:=(public.rezlee_membership(p_user)->>'plan')='pro';
 -- Unlimited normal household document imports still obey service-wide cost/abuse guards.
 if pro and p_feature='document' then return 'allowed';end if;
 cap:=case when pro then 50 else 3 end;
 insert into public.rezlee_feature_usage(user_id,feature,month) values(p_user,p_feature,m) on conflict do nothing;
 select used into n from public.rezlee_feature_usage where user_id=p_user and feature=p_feature and month=m for update;
 if n>=cap then return case when pro then 'monthly_limit' else 'upgrade' end;end if;
 update public.rezlee_feature_usage set used=used+1 where user_id=p_user and feature=p_feature and month=m;
 return 'allowed';
end $$;

create function public.rezlee_support_customer(p_query text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u auth.users;
begin
 if length(p_query)>254 or length(trim(p_query))<3 then return null;end if;
 select * into u from auth.users where id::text=p_query or lower(email)=lower(trim(p_query)) limit 1;
 if not found then return null;end if;
 return jsonb_build_object('id',u.id,'createdAt',u.created_at,'verified',u.email_confirmed_at is not null,
 'lastSignIn',u.last_sign_in_at,'membership',case when public.rezlee_account_active(u.id) then public.rezlee_membership(u.id) else null end);
end $$;

create function public.rezlee_support_change(p_actor uuid,p_action text,p_reference uuid,p_revision integer,p_payload jsonb,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; target uuid;
begin
 if p_actor is null or length(trim(coalesce(p_reason,''))) not between 8 and 500 then raise exception 'Reason required' using errcode='PT400';end if;
 if p_action='case_create' then
 target:=(p_payload->>'customerId')::uuid;
 insert into public.rezlee_support_cases(customer_id,subject,note,assigned_to)
 values(target,p_payload->>'subject',coalesce(p_payload->>'note',''),p_actor) returning to_jsonb(rezlee_support_cases.*) into result;
 elsif p_action='case_update' then
 update public.rezlee_support_cases set status=p_payload->>'status',note=coalesce(p_payload->>'note',note),
 assigned_to=case when (p_payload->>'claim')::boolean then p_actor else assigned_to end,revision=revision+1,updated_at=now()
 where id=p_reference and revision=p_revision returning to_jsonb(rezlee_support_cases.*),customer_id into result,target;
 elsif p_action='provider_update' then
 insert into public.rezlee_provider_controls(provider_key) values(coalesce(p_payload->>'providerKey',p_reference::text)) on conflict do nothing;
 update public.rezlee_provider_controls set paused=(p_payload->>'paused')::boolean,evidence=p_payload->>'evidence',
 evidence_reference=nullif(p_payload->>'evidenceReference',''),
 verified_at=case when p_payload->>'evidence'='live_verified' then now() else null end,
 revision=revision+1,updated_at=now()
 where provider_key=coalesce(p_payload->>'providerKey',p_reference::text) and revision=p_revision
 and (p_payload->>'evidence'<>'live_verified' or length(coalesce(p_payload->>'evidenceReference','')) between 8 and 200)
 returning to_jsonb(rezlee_provider_controls.*) into result;
 elsif p_action='vendor_update' then
 if (p_payload->>'reviewBefore')::timestamptz<=now() or (p_payload->>'reviewBefore')::timestamptz>now()+interval '90 days' then raise exception 'Review date must be within 90 days' using errcode='PT400';end if;
 if p_payload->>'status'='ready' and (length(trim(coalesce(p_payload->>'plan','')))<2 or length(trim(coalesce(p_payload->>'limitNotes','')))<30) then raise exception 'Record verified plan and limits before marking ready' using errcode='PT400';end if;
 insert into public.rezlee_vendor_reviews(vendor,status,review_before) values(p_payload->>'vendor','unverified',now()) on conflict do nothing;
 update public.rezlee_vendor_reviews set status=p_payload->>'status',plan=p_payload->>'plan',limit_notes=p_payload->>'limitNotes',owner_id=p_actor,reviewed_at=now(),review_before=(p_payload->>'reviewBefore')::timestamptz,revision=revision+1
 where vendor=p_payload->>'vendor' and revision=p_revision returning to_jsonb(rezlee_vendor_reviews.*) into result;
 elsif p_action='goodwill' then
 target:=p_reference;
 if not public.rezlee_account_active(target) then raise exception 'Account unavailable' using errcode='PT423';end if;
 insert into public.rezlee_entitlements(user_id,source,expires_at) values(target,'goodwill',now()+interval '30 days')
 on conflict(user_id,source) do update set expires_at=greatest(rezlee_entitlements.expires_at,excluded.expires_at),verified_at=now()
 returning to_jsonb(rezlee_entitlements.*) into result;
 else raise exception 'Unsupported action' using errcode='PT400';
 end if;
 if result is null then raise exception 'Record changed; refresh first' using errcode='PT409';end if;
 insert into public.rezlee_support_audit(operator_id,customer_id,action,reference,reason)
 values(p_actor,target,p_action,coalesce(p_reference::text,result->>'id',result->>'provider_key',result->>'vendor'),p_reason);
 return result;
end $$;
revoke all on function public.rezlee_activate_member(uuid),public.rezlee_membership(uuid),public.rezlee_reserve_feature(uuid,text),public.rezlee_support_customer(text),public.rezlee_support_change(uuid,text,uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.rezlee_activate_member(uuid),public.rezlee_membership(uuid),public.rezlee_reserve_feature(uuid,text),public.rezlee_support_customer(text),public.rezlee_support_change(uuid,text,uuid,integer,jsonb,text) to service_role;
notify pgrst,'reload schema';

do $$ declare t text; begin
 foreach t in array array['rezlee_member_accounts','rezlee_founder_allocations','rezlee_entitlements','rezlee_feature_usage','rezlee_store_sync'] loop
 execute format('create trigger guard_deleting_account before insert or update on public.%I for each row execute function public.guard_deleting_rezlee_account()',t);
 end loop;
end $$;
