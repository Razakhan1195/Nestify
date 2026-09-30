-- Independent waitlist: no household/customer schema changes.
create table public.rezlee_waitlist_campaign (
 singleton boolean primary key default true check(singleton), allocated integer not null default 0 check(allocated between 0 and 10000)
);
insert into public.rezlee_waitlist_campaign(singleton) values(true);
create table public.rezlee_waitlist (
 id uuid primary key default gen_random_uuid(), email text not null unique check(email=lower(trim(email)) and length(email)<=254),
 status text not null default 'pending' check(status in ('pending','confirmed','unsubscribed')),
 created_at timestamptz not null default now(), confirmed_at timestamptz, unsubscribed_at timestamptz,
 slot integer unique check(slot between 1 and 10000), offer_version text not null default 'founding-v1',
 consent_version text not null, consent_at timestamptz not null default now(),
 confirmation_hash text, confirmation_expires_at timestamptz, last_requested_at timestamptz not null default now(),
 delivery_status text not null default 'pending' check(delivery_status in ('pending','sent','failed'))
);
create index rezlee_waitlist_created_idx on public.rezlee_waitlist(created_at desc,id);
create index rezlee_waitlist_status_idx on public.rezlee_waitlist(status,created_at desc);
create table public.rezlee_waitlist_limits (key text primary key, window_at timestamptz not null, requests integer not null);
create table public.rezlee_waitlist_access_log (id bigint generated always as identity primary key, operator_id uuid not null, created_at timestamptz not null default now(), event text not null check(event in ('list','export')));
alter table public.rezlee_waitlist_campaign enable row level security;
alter table public.rezlee_waitlist enable row level security;
alter table public.rezlee_waitlist_limits enable row level security;
alter table public.rezlee_waitlist_access_log enable row level security;
revoke all on public.rezlee_waitlist_campaign,public.rezlee_waitlist,public.rezlee_waitlist_limits,public.rezlee_waitlist_access_log from anon,authenticated;
grant all on public.rezlee_waitlist_campaign,public.rezlee_waitlist,public.rezlee_waitlist_limits,public.rezlee_waitlist_access_log to service_role;
grant usage,select on sequence public.rezlee_waitlist_access_log_id_seq to service_role;
create function public.rezlee_waitlist_limit(p_key text,p_max integer,p_seconds integer) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer; begin
 delete from public.rezlee_waitlist_limits where window_at < now()-interval '35 days';
 insert into public.rezlee_waitlist_limits as l(key,window_at,requests) values(p_key,now(),1)
 on conflict(key) do update set requests=case when l.window_at < now()-make_interval(secs=>p_seconds) then 1 else l.requests+1 end,
 window_at=case when l.window_at < now()-make_interval(secs=>p_seconds) then now() else l.window_at end returning requests into n;
 return n<=p_max;
end $$;
create function public.rezlee_join_waitlist(p_email text,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rezlee_waitlist; begin
 -- Per-email advisory lock prevents simultaneous duplicate emails and repeat sends.
 perform pg_advisory_xact_lock(hashtextextended(lower(trim(p_email)),9810));
 select * into r from public.rezlee_waitlist where email=lower(trim(p_email)) for update;
 if found and r.last_requested_at>now()-interval '10 minutes' then return '{}'::jsonb; end if;
 if found and r.status='confirmed' then return '{}'::jsonb; end if;
 insert into public.rezlee_waitlist(email,consent_version,confirmation_hash,confirmation_expires_at)
 values(lower(trim(p_email)),'waitlist-launch-v1',p_hash,now()+interval '24 hours')
 on conflict(email) do update set confirmation_hash=p_hash,confirmation_expires_at=now()+interval '24 hours',last_requested_at=now(),delivery_status='pending'
 returning * into r;
 return jsonb_build_object('id',r.id,'email',r.email);
end $$;
create function public.rezlee_confirm_waitlist(p_id uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rezlee_waitlist; n integer; begin
 select * into r from public.rezlee_waitlist where id=p_id for update;
 if not found or r.confirmation_hash is distinct from p_hash then return jsonb_build_object('state','invalid'); end if;
 if r.status='confirmed' then return jsonb_build_object('state','confirmed','slot',r.slot); end if;
 if r.confirmation_expires_at<now() then return jsonb_build_object('state','expired'); end if;
 if r.slot is null then
  select allocated into n from public.rezlee_waitlist_campaign where singleton for update;
  if n<10000 then n:=n+1; update public.rezlee_waitlist_campaign set allocated=n where singleton; else n:=null; end if;
 else n:=r.slot; end if;
 update public.rezlee_waitlist set status='confirmed',slot=n,confirmed_at=coalesce(confirmed_at,now()),unsubscribed_at=null,consent_at=now(),consent_version='waitlist-launch-v1' where id=p_id;
 return jsonb_build_object('state','confirmed','slot',n);
end $$;
revoke all on function public.rezlee_waitlist_limit(text,integer,integer),public.rezlee_join_waitlist(text,text),public.rezlee_confirm_waitlist(uuid,text) from public,anon,authenticated;
grant execute on function public.rezlee_waitlist_limit(text,integer,integer),public.rezlee_join_waitlist(text,text),public.rezlee_confirm_waitlist(uuid,text) to service_role;
