-- Newer feature tables must share the account freeze installed in September.
-- Preserve FK SET NULL cleanup during account deletion without permitting a
-- late worker to change customer content or recreate an owned record.
create or replace function public.guard_deleting_rezlee_account() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid; record_json jsonb := to_jsonb(new);
begin
 if tg_op='UPDATE' and pg_trigger_depth()>1 and not exists (
  select 1 from jsonb_each(record_json-'updated_at') changed
  where changed.value is distinct from (to_jsonb(old)->changed.key)
  and not (
   changed.value='null'::jsonb and exists (
    select 1 from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
    where c.conrelid=tg_relid and c.contype='f' and c.confdeltype='n' and a.attname=changed.key
   )
  )
 ) then return new; end if;
 target := coalesce((record_json->>'user_id')::uuid,(record_json->>'created_by_user_id')::uuid);
 if target is not null then
  perform pg_advisory_xact_lock(hashtextextended(target::text,742));
  if not public.rezlee_account_active(target) then raise exception 'Account is being deleted' using errcode='42501'; end if;
 end if;
 return new;
end $$;

do $$ declare table_name text; guard text := 'public.rezlee_account_active(auth.uid()) and public.rezlee_account_active(user_id)'; begin
 foreach table_name in array array[
  'bill_outcome_actions','bill_record_choices','bill_record_versions','cleaning_routines','customer_feedback',
  'deck_telecom_imports','deck_telecom_pushes','deck_telecom_snapshots','inventory_create_requests',
  'notification_preferences','quote_reviews','shared_expense_bill_links','shared_expense_requests',
  'vault_save_receipts','welcome_email_deliveries','gmail_import_ai_reservations'
 ] loop
  execute format('create policy rezlee_active_accounts on public.%I as restrictive for all to authenticated using (%s) with check (%s)',table_name,guard,guard);
  -- Reservation finalization must still account for an already admitted cost;
  -- this service-only ledger has no customer payload or user grants.
  if table_name<>'gmail_import_ai_reservations' then
   execute format('create trigger guard_deleting_account before insert or update on public.%I for each row execute function public.guard_deleting_rezlee_account()',table_name);
  end if;
 end loop;
end $$;
notify pgrst,'reload schema';
