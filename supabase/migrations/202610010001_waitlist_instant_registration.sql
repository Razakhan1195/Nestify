-- Registration is immediate; email ownership verification remains separate.
-- Keep legacy status values/API compatibility and every existing reservation.
alter table public.rezlee_waitlist add column joined_at timestamptz;
alter table public.rezlee_waitlist add column email_verified_at timestamptz;
alter table public.rezlee_waitlist add column signup_method text not null default 'email_confirmation' check(signup_method in ('email_confirmation','form'));
update public.rezlee_waitlist set joined_at=confirmed_at,email_verified_at=confirmed_at where confirmed_at is not null;
alter table public.rezlee_waitlist alter column offer_version set default 'founding-public-v3';
create or replace function public.rezlee_register_waitlist(p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.rezlee_waitlist; n integer; held integer; begin
 p_email:=lower(trim(p_email));
 if length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'invalid_email'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_email,9810));
 select * into r from public.rezlee_waitlist where email=p_email for update;
 if found and r.status='confirmed' and r.joined_at is not null then
  return jsonb_build_object('state','joined','reserved',r.slot is not null);
 end if;
 n:=r.slot;
 if n is null then
  select allocated,held_back into n,held from public.rezlee_waitlist_campaign where singleton for update;
  if n<10000-held then n:=n+1; update public.rezlee_waitlist_campaign set allocated=n where singleton; else n:=null; end if;
 end if;
 insert into public.rezlee_waitlist(email,status,slot,joined_at,signup_method,consent_version,offer_version)
 values(p_email,'confirmed',n,now(),'form','waitlist-launch-v1','founding-public-v3')
 on conflict(email) do update set status='confirmed',slot=n,joined_at=coalesce(rezlee_waitlist.joined_at,now()),signup_method='form',unsubscribed_at=null,consent_at=now(),last_requested_at=now(),offer_version='founding-public-v3';
 return jsonb_build_object('state','joined','reserved',n is not null);
end $$;
revoke all on function public.rezlee_register_waitlist(text) from public,anon,authenticated;
grant execute on function public.rezlee_register_waitlist(text) to service_role;
-- Honour prior form submissions with recorded consent, in original submission order.
-- Never re-enrol unsubscribed people.
do $$ declare r record; begin
 for r in select email from public.rezlee_waitlist where status='pending' order by created_at,id loop
  perform public.rezlee_register_waitlist(r.email);
 end loop;
end $$;
