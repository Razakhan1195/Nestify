-- Historical charges are evidence, not a claim about outstanding payment.
-- Compatible with older clients: ordinary bills retain their unpaid default.
alter table public.bills alter column payment_status drop not null;

create unique index if not exists bills_manual_history_period_uidx
on public.bills(user_id, home_id, lower(btrim(custom_provider_name)),
  lower(btrim(account_number_masked)), lower(btrim(raw_data->>'category')),
  currency, billing_period_start, billing_period_end)
where source = 'manual' and raw_data->>'record_kind' = 'historical';

alter table public.bills add constraint bills_manual_history_shape_check check (
  not (source = 'manual' and coalesce(raw_data->>'record_kind', '') = 'historical')
  or (
    status = 'archived' and provider_id is null and provider_connection_id is null
    and payment_status is null and paid_at is null and amount_paid is null
    and current_amount_due is null and reminder_date is null
    and billing_period_start is not null and billing_period_end is not null
    and billing_period_end >= billing_period_start and amount is not null
    and currency = 'CAD'
    and coalesce(length(btrim(custom_provider_name)), 0) > 0
    and coalesce(length(btrim(account_number_masked)), 0) > 0
    and coalesce(length(btrim(raw_data->>'category')), 0) > 0
    and coalesce(raw_data->>'amount_basis', '') = 'period_charges'
  )
);

-- Let newer mobile clients hide this entry mode until the matching schema exists.
create or replace function public.rezlee_manual_history_available()
returns boolean language sql stable security invoker set search_path = public
as $$ select auth.uid() is not null $$;
revoke all on function public.rezlee_manual_history_available() from public, anon;
grant execute on function public.rezlee_manual_history_available() to authenticated;
