-- Preserve deletion fences while evaluating the requesting account once per statement.
-- A row owned by that same, already-checked account needs no second identical lookup.
-- Other owners are still checked per row, including shared-household reads.
do $$
declare p record; q text; c text;
begin
 for p in select schemaname,tablename,policyname,qual,with_check from pg_policies
 where schemaname='public' and policyname='rezlee_active_accounts' loop
  q := replace(p.qual,'rezlee_account_active(auth.uid())','(select public.rezlee_account_active(auth.uid()))');
  c := replace(p.with_check,'rezlee_account_active(auth.uid())','(select public.rezlee_account_active(auth.uid()))');
  if position('rezlee_account_active(user_id)' in coalesce(p.qual,p.with_check,''))>0 then
   q := replace(q,'rezlee_account_active(user_id)','(user_id = (select auth.uid()) or public.rezlee_account_active(user_id))');
   c := replace(c,'rezlee_account_active(user_id)','(user_id = (select auth.uid()) or public.rezlee_account_active(user_id))');
  end if;
  if position('rezlee_account_active(created_by_user_id)' in coalesce(p.qual,p.with_check,''))>0 then
   q := replace(q,'rezlee_account_active(created_by_user_id)','(created_by_user_id = (select auth.uid()) or public.rezlee_account_active(created_by_user_id))');
   c := replace(c,'rezlee_account_active(created_by_user_id)','(created_by_user_id = (select auth.uid()) or public.rezlee_account_active(created_by_user_id))');
  end if;
  execute format('alter policy %I on %I.%I using (%s) with check (%s)',p.policyname,p.schemaname,p.tablename,q,c);
 end loop;
end $$;
notify pgrst,'reload schema';
