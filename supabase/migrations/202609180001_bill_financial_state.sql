alter table public.bills
  add column if not exists current_amount_due numeric,
  add column if not exists payment_date date,
  add column if not exists autopay_scheduled_amount numeric,
  add column if not exists autopay_scheduled_date date,
  add column if not exists autopay_payment_method text;

comment on column public.bills.amount is 'Original statement amount billed for the statement period.';
comment on column public.bills.current_amount_due is 'Current outstanding balance for this bill after payments/credits.';
comment on column public.bills.amount_paid is 'Amount paid toward this bill when known.';
comment on column public.bills.autopay_scheduled_amount is 'Scheduled pre-authorized/autopay amount when visible at the provider.';
comment on column public.bills.autopay_scheduled_date is 'Scheduled pre-authorized/autopay date when visible at the provider.';
