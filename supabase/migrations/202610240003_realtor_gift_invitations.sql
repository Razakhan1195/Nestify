-- Recipient-bound invitation. Only a verified matching account can redeem.
create table public.rezlee_gift_invitations (
 id uuid primary key,
 realtor_name text not null check(length(trim(realtor_name)) between 2 and 100),
 recipient_email text not null check(length(recipient_email) between 3 and 254),
 order_reference text not null check(length(trim(order_reference)) between 3 and 120),
 created_by uuid not null,
 created_at timestamptz not null default now(),
 claim_by timestamptz not null default now()+interval '30 days',
 claimed_by uuid references auth.users(id) on delete set null,
 claimed_at timestamptz,
 revoked_at timestamptz
);
alter table public.rezlee_gift_invitations enable row level security;
revoke all on public.rezlee_gift_invitations from public,anon,authenticated;
grant all on public.rezlee_gift_invitations to service_role;
create function public.rezlee_claim_gift_invitation(p_id uuid,p_user uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.rezlee_gift_invitations; u auth.users; receipt jsonb;
begin
 if p_user is null or not public.rezlee_account_active(p_user) then raise exception 'Account unavailable' using errcode='PT403';end if;
 -- Same user lock and order as manual fulfillment; serialization also protects double taps.
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,742));
 select * into i from public.rezlee_gift_invitations where id=p_id for update;
 if not found or i.revoked_at is not null then raise exception 'Invitation unavailable' using errcode='PT404'; end if;
 select * into u from auth.users where id=p_user;
 if u.email_confirmed_at is null or lower(trim(u.email)) is distinct from lower(trim(i.recipient_email)) then raise exception 'Sign in with the invited verified email' using errcode='PT403';end if;
 if i.claimed_at is not null then
  if i.claimed_by is distinct from p_user then raise exception 'Already claimed' using errcode='PT409';end if;
  select to_jsonb(g) into receipt from public.rezlee_annual_gifts g where id=p_id;
  if receipt is null or receipt->>'revoked_at' is not null then raise exception 'Gift unavailable' using errcode='PT409';end if;
  return receipt || jsonb_build_object('realtorName',i.realtor_name);
 end if;
 if i.claim_by <= now() then raise exception 'Invitation expired' using errcode='PT410';end if;
 perform public.rezlee_activate_member(p_user);
 receipt:=public.rezlee_fulfill_annual_gift(i.created_by,i.id,p_user,i.order_reference,'Recipient claimed their verified realtor invitation');
 update public.rezlee_gift_invitations set claimed_by=p_user,claimed_at=now() where id=p_id;
 return receipt || jsonb_build_object('realtorName',i.realtor_name);
end $$;
revoke all on function public.rezlee_claim_gift_invitation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.rezlee_claim_gift_invitation(uuid,uuid) to service_role;
notify pgrst,'reload schema';

-- Remove contact data on account deletion, including invitations not yet claimed.
create function public.rezlee_erase_gift_contact() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.rezlee_gift_invitations set recipient_email='deleted-account@invalid',revoked_at=coalesce(revoked_at,now())
 where claimed_by=old.id or recipient_email=lower(trim(old.email));
 return old;
end $$;
create trigger rezlee_erase_gift_contact before delete on auth.users for each row execute function public.rezlee_erase_gift_contact();
revoke all on function public.rezlee_erase_gift_contact() from public,anon,authenticated;
