-- Existing owner policies remain intact. Reject references to another account's rows.
-- WITH CHECK only: avoids recursive SELECT policies across the relation graph.
do $$
declare rel record; fk record; checks text;
begin
  for rel in select table_name from information_schema.columns where table_schema='public' and column_name='user_id' and table_name <> 'rezlee_ai_reservations' loop
    checks := 'user_id = auth.uid()';
    for fk in
      select a.attname as child_column, p.relname as parent_table, pa.attname as parent_column
      from pg_constraint c
      join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      join pg_class p on p.oid=c.confrelid join pg_namespace pn on pn.oid=p.relnamespace
      join pg_attribute a on a.attrelid=t.oid and a.attnum=c.conkey[1]
      join pg_attribute pa on pa.attrelid=p.oid and pa.attnum=c.confkey[1]
      where c.contype='f' and n.nspname='public' and pn.nspname='public'
        and t.relname=rel.table_name and array_length(c.conkey,1)=1
        and exists(select 1 from pg_attribute where attrelid=p.oid and attname='user_id' and not attisdropped)
    loop
      checks := checks || format(' and (%I is null or exists (select 1 from public.%I as parent where parent.%I = %I.%I and parent.user_id = auth.uid()))', fk.child_column, fk.parent_table, fk.parent_column, rel.table_name, fk.child_column);
    end loop;
    execute format('create policy rezlee_owned_relationships on public.%I as restrictive for all to authenticated using (user_id = auth.uid()) with check (%s)', rel.table_name, checks);
  end loop;
end;
$$;
notify pgrst, 'reload schema';
