create table public.rezlee_waitlist_redemptions(
 waitlist_id uuid primary key references public.rezlee_waitlist(id) on delete cascade,
 user_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create table public.rezlee_waitlist_claims(
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 waitlist_id uuid references public.rezlee_waitlist(id) on delete cascade,
 proof_hash text not null check(length(proof_hash)=64),
 attempts integer not null default 0,
 expires_at timestamptz not null default now()+interval '10 minutes',
 consumed_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.rezlee_waitlist_redemptions enable row level security;
alter table public.rezlee_waitlist_claims enable row level security;
revoke all on public.rezlee_waitlist_redemptions,public.rezlee_waitlist_claims from public,anon,authenticated;
grant all on public.rezlee_waitlist_redemptions,public.rezlee_waitlist_claims to service_role;
create trigger guard_deleting_account before insert or update on public.rezlee_waitlist_redemptions for each row execute function public.guard_deleting_rezlee_account();
create trigger guard_deleting_account before insert or update on public.rezlee_waitlist_claims for each row execute function public.guard_deleting_rezlee_account();
insert into public.rezlee_waitlist_redemptions(waitlist_id,user_id)
select w.id,u.id from public.rezlee_waitlist w join auth.users u on lower(trim(u.email))=w.email
join public.rezlee_entitlements e on e.user_id=u.id and e.source='founder'
where w.slot is not null on conflict do nothing;
create function public.rezlee_start_waitlist_claim(p_user uuid,p_id uuid,p_email text,p_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
declare w uuid;
begin
 if not public.rezlee_account_active(p_user) then raise exception 'Account unavailable';end if;
 if not public.rezlee_waitlist_limit('member-claim-user:'||p_user::text,3,3600) then raise exception 'Please wait before requesting another code' using errcode='PT429';end if;
 select id into w from public.rezlee_waitlist where email=lower(trim(p_email)) and slot is not null
 and ((select waitlist_cutoff_at from public.rezlee_membership_campaign where singleton) is null or created_at<=(select waitlist_cutoff_at from public.rezlee_membership_campaign where singleton));
 delete from public.rezlee_waitlist_claims where user_id=p_user;
 insert into public.rezlee_waitlist_claims(id,user_id,waitlist_id,proof_hash) values(p_id,p_user,w,p_hash);
 return w is not null;
end $$;
create function public.rezlee_finish_waitlist_claim(p_user uuid,p_id uuid,p_hash text) returns text
language plpgsql security definer set search_path='' as $$
declare c public.rezlee_waitlist_claims; owner uuid;
begin
 if not public.rezlee_account_active(p_user) then return 'unavailable';end if;
 select * into c from public.rezlee_waitlist_claims where id=p_id and user_id=p_user for update;
 if not found or c.expires_at<=now() or c.attempts>=5 then return 'invalid';end if;
 if c.consumed_at is not null then return 'claimed';end if;
 update public.rezlee_waitlist_claims set attempts=attempts+1 where id=p_id;
 if c.proof_hash<>p_hash or c.waitlist_id is null then return 'invalid';end if;
 perform pg_advisory_xact_lock(hashtextextended(c.waitlist_id::text,16012026));
 insert into public.rezlee_waitlist_redemptions(waitlist_id,user_id) values(c.waitlist_id,p_user) on conflict do nothing;
 select user_id into owner from public.rezlee_waitlist_redemptions where waitlist_id=c.waitlist_id;
 if owner is distinct from p_user then return 'already_claimed';end if;
 insert into public.rezlee_entitlements(user_id,source) values(p_user,'founder') on conflict do nothing;
 insert into public.rezlee_founder_allocations(user_id,reason) values(p_user,'waitlist') on conflict(user_id) do nothing;
 update public.rezlee_waitlist_claims set consumed_at=now() where id=p_id;
 return 'claimed';
end $$;
revoke all on function public.rezlee_start_waitlist_claim(uuid,uuid,text,text),public.rezlee_finish_waitlist_claim(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.rezlee_start_waitlist_claim(uuid,uuid,text,text),public.rezlee_finish_waitlist_claim(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';

create or replace function public.rezlee_activate_member(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u auth.users; c public.rezlee_membership_campaign; n integer; eligible boolean; existing boolean; waitlist uuid; owner uuid;
begin
 if not public.rezlee_account_active(p_user) then raise exception 'Account unavailable' using errcode='PT423';end if;
 select * into u from auth.users where id=p_user;
 if not found or u.email_confirmed_at is null or u.email is null then raise exception 'Verify email first' using errcode='PT403';end if;
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
 if not existing and c.activated<1000 then
 n:=c.activated+1;
 update public.rezlee_membership_campaign set activated=n where singleton;
 end if;
 insert into public.rezlee_member_accounts(user_id) values(p_user) on conflict do nothing;
 if eligible or n is not null then
 insert into public.rezlee_founder_allocations(user_id,slot,reason) values(p_user,n,case when eligible then 'waitlist' else 'first_1000' end) on conflict(user_id) do nothing;
 insert into public.rezlee_entitlements(user_id,source) values(p_user,'founder') on conflict do nothing;
 end if;
end $$;
