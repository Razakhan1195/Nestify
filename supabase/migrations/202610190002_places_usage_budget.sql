-- Server-only cost circuit breaker. Counts attempts before contacting Google;
-- failed/time-out calls remain charged against the cap. Stores no address or user data.
create table public.places_usage_budget (
 period date not null,
 kind text not null check (kind in ('autocomplete','details')),
 attempts integer not null default 0 check (attempts >= 0),
 primary key (period,kind)
);
alter table public.places_usage_budget enable row level security;
revoke all on public.places_usage_budget from public,anon,authenticated;
grant select,insert,update on public.places_usage_budget to service_role;
create function public.reserve_rezlee_places_request(p_kind text) returns boolean
language plpgsql security definer set search_path='' as $$
declare p date := date_trunc('month',now() at time zone 'America/Los_Angeles')::date; cap integer; accepted boolean;
begin
 if p_kind not in ('autocomplete','details') or p_kind is null then raise exception 'Invalid Places request kind'; end if;
 cap := case p_kind when 'autocomplete' then 2500 else 1000 end;
 insert into public.places_usage_budget(period,kind,attempts) values(p,p_kind,1)
 on conflict(period,kind) do update set attempts=public.places_usage_budget.attempts+1
 where public.places_usage_budget.attempts<cap returning true into accepted;
 return coalesce(accepted,false);
end $$;
revoke all on function public.reserve_rezlee_places_request(text) from public,anon,authenticated;
grant execute on function public.reserve_rezlee_places_request(text) to service_role;
notify pgrst,'reload schema';
