-- Avoid a global founder-allocation lock for already activated, non-waitlist accounts.
CREATE OR REPLACE FUNCTION public.rezlee_activate_member(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u auth.users; c public.rezlee_membership_campaign; n integer; eligible boolean; existing boolean; waitlist uuid; owner uuid;
begin
 if not public.rezlee_account_active(p_user) then raise exception 'Account unavailable' using errcode='PT423';end if;
 select * into u from auth.users where id=p_user;
 if not found or u.email_confirmed_at is null or u.email is null then raise exception 'Verify email first' using errcode='PT403';end if;
 -- Repeat activation without a reserved waitlist promise cannot allocate anything.
 -- Keep current account/email gates above and preserve the locked allocation path below.
 if exists(select 1 from public.rezlee_member_accounts where user_id=p_user)
    and exists(select 1 from public.rezlee_membership_campaign where singleton)
    and not exists(select 1 from public.rezlee_waitlist w
                   where w.email=lower(trim(u.email)) and w.slot is not null) then
  return;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('rezlee-founder-activation-v1',16012026));
 select exists(select 1 from public.rezlee_member_accounts where user_id=p_user) into existing;
 select * into c from public.rezlee_membership_campaign where singleton for update;
 if not found then raise exception 'Membership unavailable';end if;
 -- Previously reserved waitlist promises survive marketing unsubscription.
 select w.id into waitlist from public.rezlee_waitlist w where
 w.email=lower(trim(u.email)) and w.slot is not null and (c.waitlist_cutoff_at is null or w.created_at<=c.waitlist_cutoff_at);
 eligible:=false;
 if waitlist is not null then
  perform pg_advisory_xact_lock(hashtextextended(waitlist::text,16012026));
  insert into public.rezlee_waitlist_redemptions(waitlist_id,user_id) values(waitlist,p_user) on conflict do nothing;
  select user_id into owner from public.rezlee_waitlist_redemptions where waitlist_id=waitlist;
  eligible:=owner=p_user;
 end if;
 -- The first-thousand promotion is closed. Existing grants and reserved waitlist promises remain valid.
 insert into public.rezlee_member_accounts(user_id) values(p_user) on conflict do nothing;
 if eligible or n is not null then
 insert into public.rezlee_founder_allocations(user_id,slot,reason) values(p_user,n,case when eligible then 'waitlist' else 'first_1000' end) on conflict(user_id) do nothing;
 insert into public.rezlee_entitlements(user_id,source) values(p_user,'founder') on conflict do nothing;
 end if;
end $function$
;
notify pgrst,'reload schema';
