-- FK cleanup of a deleting account may unlink originals. Do not recreate bill
-- history while deleting its owner. The bill write guard still rejects normal
-- customer/worker changes; only verified nested FK cleanup reaches this hook.
create or replace function public.retain_rezlee_bill_version() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not public.rezlee_account_active(old.user_id) then return new; end if;
 if public.rezlee_bill_snapshot(old) is distinct from public.rezlee_bill_snapshot(new) then
  insert into public.bill_record_versions(bill_id,user_id,home_id,snapshot)
  values(old.id,old.user_id,old.home_id,public.rezlee_bill_snapshot(old));
 end if;
 return new;
end $$;
revoke all on function public.retain_rezlee_bill_version() from public,anon,authenticated;
notify pgrst,'reload schema';
