create table public.rezlee_feature_reservations(
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 feature text not null check(feature in ('document','assistant')),month date not null,
 charged boolean not null,refunded_at timestamptz,created_at timestamptz not null default now()
);
alter table public.rezlee_feature_reservations enable row level security;
revoke all on public.rezlee_feature_reservations from public,anon,authenticated;
grant all on public.rezlee_feature_reservations to service_role;
create trigger guard_deleting_account before insert or update on public.rezlee_feature_reservations for each row execute function public.guard_deleting_rezlee_account();
create function public.rezlee_reserve_feature_once(p_user uuid,p_feature text,p_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare m date:=date_trunc('month',now() at time zone 'UTC')::date;before_count integer;after_count integer;result text;
begin
 if not public.rezlee_account_active(p_user) then return 'unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text||p_feature,16012026));
 if exists(select 1 from public.rezlee_feature_reservations where id=p_id) then return 'unavailable';end if;
 select coalesce((select used from public.rezlee_feature_usage where user_id=p_user and feature=p_feature and month=m),0) into before_count;
 result:=public.rezlee_reserve_feature(p_user,p_feature);
 if result<>'allowed' then return result;end if;
 select coalesce((select used from public.rezlee_feature_usage where user_id=p_user and feature=p_feature and month=m),0) into after_count;
 insert into public.rezlee_feature_reservations(id,user_id,feature,month,charged)values(p_id,p_user,p_feature,m,after_count>before_count);
 return result;
end $$;
create function public.rezlee_refund_failed_feature(p_user uuid,p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rezlee_feature_reservations;
begin
 select * into r from public.rezlee_feature_reservations where id=p_id and user_id=p_user for update;
 if not found or r.refunded_at is not null then return;end if;
 if r.charged then update public.rezlee_feature_usage set used=greatest(0,used-1) where user_id=p_user and feature=r.feature and month=r.month;end if;
 update public.rezlee_feature_reservations set refunded_at=now() where id=p_id;
end $$;
revoke all on function public.rezlee_reserve_feature_once(uuid,text,uuid),public.rezlee_refund_failed_feature(uuid,uuid) from public,anon,authenticated;
grant execute on function public.rezlee_reserve_feature_once(uuid,text,uuid),public.rezlee_refund_failed_feature(uuid,uuid) to service_role;
notify pgrst,'reload schema';
