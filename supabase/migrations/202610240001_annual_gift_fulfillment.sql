-- Manual, owner-authorized annual gift fulfillment. No checkout or customer codes.
alter table public.rezlee_entitlements drop constraint rezlee_entitlements_source_check;
alter table public.rezlee_entitlements add constraint rezlee_entitlements_source_check
 check(source in ('founder','store','goodwill','referral','annual_gift'));
create table public.rezlee_annual_gifts (
 id uuid primary key,
 order_reference text not null check(length(trim(order_reference)) between 3 and 120),
 user_id uuid references auth.users(id) on delete set null,
 granted_by uuid not null,
 started_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '8760 hours',
 revoked_at timestamptz,
 terms_version text not null default 'annual-gift-pilot-v1' check(terms_version='annual-gift-pilot-v1'),
 check(expires_at=started_at+interval '8760 hours')
);
create index rezlee_annual_gifts_user on public.rezlee_annual_gifts(user_id,started_at);
alter table public.rezlee_annual_gifts enable row level security;
revoke all on public.rezlee_annual_gifts from public,anon,authenticated;
grant all on public.rezlee_annual_gifts to service_role;
create trigger guard_deleting_account before insert or update on public.rezlee_annual_gifts
 for each row execute function public.guard_deleting_rezlee_account();
create function public.rezlee_fulfill_annual_gift(p_actor uuid,p_id uuid,p_user uuid,p_order text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.rezlee_annual_gifts; expiry timestamptz;
begin
 if p_actor is null or p_id is null or p_user is null or length(trim(coalesce(p_reason,''))) not between 8 and 500
 or length(trim(coalesce(p_order,''))) not between 3 and 120 then raise exception 'Complete the order and consent reference' using errcode='PT400';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,742));
 -- Stable allocation UUID makes a retry after a lost response return the original receipt.
 perform pg_advisory_xact_lock(hashtextextended('annual-gift-id:'||p_id::text,24102026));
 select * into g from public.rezlee_annual_gifts where id=p_id;
 if found then
  if g.user_id is distinct from p_user or g.order_reference<>trim(p_order) then raise exception 'Allocation belongs to another request' using errcode='PT409';end if;
  return to_jsonb(g);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('annual-gift-user:'||p_user::text,24102026));
 if not public.rezlee_account_active(p_user) or not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null)
 then raise exception 'An active verified account is required' using errcode='PT403';end if;
 if not exists(select 1 from public.rezlee_member_accounts where user_id=p_user) then raise exception 'Activate membership before checking eligibility' using errcode='PT409';end if;
 if public.rezlee_membership(p_user)->>'plan'<>'free' then raise exception 'Already has Pro; do not charge for this gift' using errcode='PT409';end if;
 expiry:=now()+interval '8760 hours';
 insert into public.rezlee_annual_gifts(id,order_reference,user_id,granted_by,expires_at)
 values(p_id,trim(p_order),p_user,p_actor,expiry) returning * into g;
 insert into public.rezlee_entitlements(user_id,source,expires_at,product_id)
 values(p_user,'annual_gift',expiry,p_id::text)
 on conflict(user_id,source) do update set expires_at=excluded.expires_at,product_id=excluded.product_id,verified_at=now();
 insert into public.rezlee_support_audit(operator_id,customer_id,action,reference,reason)
 values(p_actor,p_user,'annual_gift_fulfilled',p_id::text,p_reason);
 return to_jsonb(g);
end $$;
create function public.rezlee_revoke_annual_gift(p_actor uuid,p_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.rezlee_annual_gifts;
begin
 if p_actor is null or length(trim(coalesce(p_reason,''))) not between 8 and 500 then raise exception 'Reason required' using errcode='PT400';end if;
 select * into g from public.rezlee_annual_gifts where id=p_id;
 if g.user_id is not null then perform pg_advisory_xact_lock(hashtextextended(g.user_id::text,742));end if;
 perform pg_advisory_xact_lock(hashtextextended('annual-gift-id:'||p_id::text,24102026));
 select * into g from public.rezlee_annual_gifts where id=p_id for update;
 if not found then raise exception 'Gift not found' using errcode='PT404';end if;
 if g.revoked_at is not null then return to_jsonb(g);end if;
 if g.user_id is not null then
  perform pg_advisory_xact_lock(hashtextextended('annual-gift-user:'||g.user_id::text,24102026));
  -- Never revoke a different gift, founder, store, referral or goodwill entitlement.
  delete from public.rezlee_entitlements where user_id=g.user_id and source='annual_gift' and product_id=p_id::text;
 end if;
 update public.rezlee_annual_gifts set revoked_at=now() where id=p_id returning * into g;
 insert into public.rezlee_support_audit(operator_id,customer_id,action,reference,reason)
 values(p_actor,g.user_id,'annual_gift_revoked',p_id::text,p_reason);
 return to_jsonb(g);
end $$;
revoke all on function public.rezlee_fulfill_annual_gift(uuid,uuid,uuid,text,text),public.rezlee_revoke_annual_gift(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.rezlee_fulfill_annual_gift(uuid,uuid,uuid,text,text),public.rezlee_revoke_annual_gift(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
