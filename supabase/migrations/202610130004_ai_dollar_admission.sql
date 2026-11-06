-- Conservative USD admission ceilings supplement existing per-user and request caps.
-- Disabled until an operator explicitly configures this environment. No paid calls here.
create table public.rezlee_ai_spend_config(
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 daily_usd_cents integer not null check(daily_usd_cents between 100 and 1000000),
 monthly_usd_cents integer not null check(monthly_usd_cents between 100 and 10000000),
 feature_daily_usd_cents integer not null check(feature_daily_usd_cents between 100 and 1000000),
 feature_monthly_usd_cents integer not null check(feature_monthly_usd_cents between 100 and 10000000),
 price_review_before timestamptz not null,
 updated_at timestamptz not null default now()
);
insert into public.rezlee_ai_spend_config(singleton,enabled,daily_usd_cents,monthly_usd_cents,feature_daily_usd_cents,feature_monthly_usd_cents,price_review_before)
 values(true,false,2000,10000,1000,5000,now()+interval '30 days');
create table public.rezlee_ai_spend_windows(
 scope text not null check(scope in ('all','assistant','document','repair','gmail','quote','maintenance')),
 kind text not null check(kind in ('day','month')),
 starts_on date not null,
 reserved_usd_cents bigint not null default 0 check(reserved_usd_cents>=0),
 attempts integer not null default 0 check(attempts>=0),
 primary key(scope,kind,starts_on)
);
alter table public.rezlee_ai_spend_config enable row level security;
alter table public.rezlee_ai_spend_windows enable row level security;
revoke all on public.rezlee_ai_spend_config,public.rezlee_ai_spend_windows from public,anon,authenticated;
grant all on public.rezlee_ai_spend_config,public.rezlee_ai_spend_windows to service_role;
create function public.reserve_rezlee_ai_spend(p_feature text,p_model text) returns text
language plpgsql security definer set search_path='' as $$
declare c public.rezlee_ai_spend_config; d date:=(now() at time zone 'UTC')::date;
 m date:=date_trunc('month',now() at time zone 'UTC')::date;
begin
 if p_feature not in ('assistant','document','repair','gmail','quote','maintenance') or p_feature is null
  or p_model not in ('gemini-2.5-flash','gemini-2.5-flash-lite','google/gemini-2.5-flash','google/gemini-2.5-flash-lite','openai/gpt-5-mini') or p_model is null then return 'unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended('rezlee-ai-usd-admission-v1',13102026));
 select * into c from public.rezlee_ai_spend_config where singleton=true;
 if not found or not c.enabled or c.price_review_before<=now() then return 'unavailable';end if;
 insert into public.rezlee_ai_spend_windows(scope,kind,starts_on)
 values('all','day',d),('all','month',m),(p_feature,'day',d),(p_feature,'month',m) on conflict do nothing;
 if exists(select 1 from public.rezlee_ai_spend_windows w where
  ((w.kind='day' and w.starts_on=d) or(w.kind='month' and w.starts_on=m)) and w.scope in('all',p_feature)
  and w.reserved_usd_cents+100>case
   when w.scope='all' and w.kind='day' then c.daily_usd_cents
   when w.scope='all' then c.monthly_usd_cents
   when w.kind='day' then c.feature_daily_usd_cents else c.feature_monthly_usd_cents end) then return 'limited';end if;
 update public.rezlee_ai_spend_windows set reserved_usd_cents=reserved_usd_cents+100,attempts=attempts+1
 where scope in('all',p_feature) and ((kind='day' and starts_on=d)or(kind='month' and starts_on=m));
 return 'allowed';
end $$;
revoke all on function public.reserve_rezlee_ai_spend(text,text) from public,anon,authenticated;
grant execute on function public.reserve_rezlee_ai_spend(text,text) to service_role;
comment on table public.rezlee_ai_spend_windows is 'Aggregate USD reservations per actual model attempt. Never refunded on timeout, provider rejection or account deletion. This is an admission ceiling under reviewed model/rate assumptions, not invoiced usage or a cap on other services/accounts.';
notify pgrst,'reload schema';
