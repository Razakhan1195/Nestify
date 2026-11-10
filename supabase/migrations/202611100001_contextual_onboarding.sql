-- Minimal, idempotent first home. No inferred location, tasks or preference.
create function public.rezlee_start_home() returns uuid
language plpgsql security invoker set search_path = '' as $$
declare u uuid := auth.uid(); h uuid;
begin
  if u is null or not public.rezlee_account_active(u) then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text, 111026));
  select id into h from public.homes where user_id = u order by created_at, id limit 1;
  if h is not null then return h; end if;
  select home_id into h from public.household_members
    where linked_user_id = u and status = 'active' order by created_at, id limit 1;
  if h is not null then return h; end if;
  if public.rezlee_has_expense_groups() then return null; end if;
  insert into public.homes(user_id, nickname) values(u, 'Home') returning id into h;
  return h;
end $$;
revoke all on function public.rezlee_start_home() from public, anon;
grant execute on function public.rezlee_start_home() to authenticated;
notify pgrst, 'reload schema';
