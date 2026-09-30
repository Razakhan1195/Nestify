-- A real public allocation, separate from confirmed people and reserved member slots.
-- Preserve every existing registration and assigned place.
alter table public.rezlee_waitlist_campaign add column held_back integer not null default 0;
alter table public.rezlee_waitlist_campaign add constraint rezlee_waitlist_capacity check (held_back>=0 and allocated+held_back<=10000);
update public.rezlee_waitlist_campaign set held_back=4679 where singleton;
alter table public.rezlee_waitlist alter column offer_version set default 'founding-public-v2';
create or replace function public.rezlee_confirm_waitlist(p_id uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.rezlee_waitlist; n integer; held integer; begin
 select * into r from public.rezlee_waitlist where id=p_id for update;
 if not found or r.confirmation_hash is distinct from p_hash then return jsonb_build_object('state','invalid'); end if;
 if r.status='confirmed' then return jsonb_build_object('state','confirmed','slot',r.slot); end if;
 if r.confirmation_expires_at<now() then return jsonb_build_object('state','expired'); end if;
 if r.slot is null then
  select allocated,held_back into n,held from public.rezlee_waitlist_campaign where singleton for update;
  if n<10000-held then n:=n+1; update public.rezlee_waitlist_campaign set allocated=n where singleton; else n:=null; end if;
 else n:=r.slot; end if;
 update public.rezlee_waitlist set status='confirmed',slot=n,confirmed_at=coalesce(confirmed_at,now()),unsubscribed_at=null,consent_at=now(),consent_version='waitlist-launch-v1' where id=p_id;
 return jsonb_build_object('state','confirmed','slot',n);
end $$;
