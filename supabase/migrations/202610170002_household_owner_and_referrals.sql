-- A home owner must be present in the same assignment list as household members.
create or replace function public.rezlee_ensure_home_owner_member() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.household_members(home_id,created_by_user_id,linked_user_id,display_name,email,relationship,role,status)
 select new.id,new.user_id,new.user_id,coalesce(nullif(trim(p.full_name),''),'You'),p.email,'You','owner','active'
 from (select 1) seed left join public.profiles p on p.user_id=new.user_id
 on conflict(home_id,linked_user_id) where linked_user_id is not null do nothing;
 return new;
end $$;
revoke all on function public.rezlee_ensure_home_owner_member() from public,anon,authenticated;
create trigger rezlee_home_owner_member after insert on public.homes for each row execute function public.rezlee_ensure_home_owner_member();
insert into public.household_members(home_id,created_by_user_id,linked_user_id,display_name,email,relationship,role,status)
select h.id,h.user_id,h.user_id,coalesce(nullif(trim(p.full_name),''),'You'),p.email,'You','owner','active'
from public.homes h left join public.profiles p on p.user_id=h.user_id
where not exists(select 1 from public.household_members m where m.home_id=h.id and m.linked_user_id=h.user_id)
on conflict(home_id,linked_user_id) where linked_user_id is not null do nothing;

-- A referral grants a new friend one calendar month, never a subscription or household access.
create table public.rezlee_referral_codes(
 user_id uuid primary key references auth.users(id) on delete cascade,
 code text not null unique check(code ~ '^[A-F0-9]{12}$'),created_at timestamptz not null default now()
);
create table public.rezlee_referral_claims(
 user_id uuid primary key references auth.users(id) on delete cascade,
 inviter_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),expires_at timestamptz not null
);
alter table public.rezlee_referral_codes enable row level security;
alter table public.rezlee_referral_claims enable row level security;
revoke all on public.rezlee_referral_codes,public.rezlee_referral_claims from public,anon,authenticated;
grant all on public.rezlee_referral_codes,public.rezlee_referral_claims to service_role;
create trigger guard_deleting_account before insert or update on public.rezlee_referral_codes for each row execute function public.guard_deleting_rezlee_account();
create trigger guard_deleting_account before insert or update on public.rezlee_referral_claims for each row execute function public.guard_deleting_rezlee_account();
alter table public.rezlee_entitlements drop constraint rezlee_entitlements_source_check;
alter table public.rezlee_entitlements add constraint rezlee_entitlements_source_check check(source in ('founder','store','goodwill','referral'));

create function public.rezlee_referral_code(p_user uuid) returns text
language plpgsql security definer set search_path='' as $$
declare result text;
begin
 if not public.rezlee_account_active(p_user) or not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then raise exception 'Verified account required' using errcode='PT403';end if;
 insert into public.rezlee_referral_codes(user_id,code) values(p_user,upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))) on conflict(user_id) do nothing;
 select code into result from public.rezlee_referral_codes where user_id=p_user;
 return result;
end $$;
create function public.rezlee_claim_referral(p_user uuid,p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sender uuid; expiry timestamptz; u auth.users;
begin
 if not public.rezlee_account_active(p_user) then raise exception 'Account unavailable' using errcode='PT403';end if;
 select * into u from auth.users where id=p_user;
 if u.email_confirmed_at is null then raise exception 'Verify your email first' using errcode='PT403';end if;
 perform pg_advisory_xact_lock(hashtextextended('referral:'||p_user::text,17022026));
 select expires_at into expiry from public.rezlee_referral_claims where user_id=p_user;
 if found then return jsonb_build_object('status','claimed','expiresAt',expiry);end if;
 select user_id into sender from public.rezlee_referral_codes where code=upper(trim(p_code));
 if sender is null or sender=p_user or not public.rezlee_account_active(sender) then raise exception 'Check the invitation code' using errcode='PT400';end if;
 if u.created_at<now()-interval '30 days' then return jsonb_build_object('status','not_new');end if;
 if (public.rezlee_membership(p_user)->>'plan')='pro' then return jsonb_build_object('status','already_pro');end if;
 expiry:=now()+interval '1 month';
 insert into public.rezlee_referral_claims(user_id,inviter_id,expires_at) values(p_user,sender,expiry);
 insert into public.rezlee_entitlements(user_id,source,expires_at,product_id) values(p_user,'referral',expiry,'friend-month') on conflict(user_id,source) do nothing;
 return jsonb_build_object('status','claimed','expiresAt',expiry);
end $$;
revoke all on function public.rezlee_referral_code(uuid),public.rezlee_claim_referral(uuid,text) from public,anon,authenticated;
grant execute on function public.rezlee_referral_code(uuid),public.rezlee_claim_referral(uuid,text) to service_role;
notify pgrst,'reload schema';
