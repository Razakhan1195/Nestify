-- Atomic global cap across all AI routes and server instances. Existing usage/history remains intact.
create table public.rezlee_ai_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index rezlee_ai_reservations_user_date on public.rezlee_ai_reservations(user_id, created_at);
alter table public.rezlee_ai_reservations enable row level security;
revoke all on public.rezlee_ai_reservations from anon, authenticated;
grant select on public.rezlee_ai_reservations to authenticated;
create policy "Users can read their AI reservations" on public.rezlee_ai_reservations for select to authenticated using (user_id = auth.uid());

create function public.reserve_rezlee_ai_request() returns boolean
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); daily_count integer; monthly_count integer;
begin
  if caller is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 9032026));
  select count(*) filter (where created_at >= now() - interval '24 hours'), count(*)
    into daily_count, monthly_count from public.rezlee_ai_reservations
    where user_id = caller and created_at >= now() - interval '30 days';
  if daily_count >= 40 or monthly_count >= 500 then return false; end if;
  insert into public.rezlee_ai_reservations (user_id) values (caller);
  return true;
end;
$$;
revoke all on function public.reserve_rezlee_ai_request() from public, anon;
grant execute on function public.reserve_rezlee_ai_request() to authenticated;
notify pgrst, 'reload schema';
