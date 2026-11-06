-- The original all-command ownership guard predates household sharing and
-- overrides its permissive SELECT policies. Split reads from writes only for
-- the two shared tables; retain the exact existing relationship write checks.
do $$
declare target text; relationship_check text; member_home text;
begin
  foreach target in array array['homes', 'maintenance_tasks'] loop
    select pg_get_expr(p.polwithcheck, p.polrelid) into relationship_check
    from pg_policy p join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = target
      and p.polname = 'rezlee_owned_relationships';
    if relationship_check is null then
      raise exception 'Expected relationship guard missing for %', target;
    end if;
    member_home := case when target = 'homes' then 'id' else 'home_id' end;
    execute format('drop policy rezlee_owned_relationships on public.%I', target);
    execute format('create policy rezlee_shared_reads on public.%I as restrictive for select to authenticated using (user_id = auth.uid() or public.is_active_household_member(%I))', target, member_home);
    execute format('create policy rezlee_owned_insert on public.%I as restrictive for insert to authenticated with check (%s)', target, relationship_check);
    execute format('create policy rezlee_owned_update on public.%I as restrictive for update to authenticated using (user_id = auth.uid()) with check (%s)', target, relationship_check);
    execute format('create policy rezlee_owned_delete on public.%I as restrictive for delete to authenticated using (user_id = auth.uid())', target);
  end loop;
end;
$$;
notify pgrst, 'reload schema';
