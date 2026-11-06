create table if not exists public.bill_payment_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  bill_id uuid references public.bills(id) on delete set null,
  operation text not null,
  amount numeric,
  payment_date date,
  payment_method_label text,
  autopay_type text,
  fixed_amount numeric,
  status text not null default 'draft',
  idempotency_key text not null unique,
  confirmation_token_hash text unique,
  confirmed_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  deck_task_run_id text,
  provider_confirmation_number text,
  failure_code text,
  failure_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bill_payment_intents_operation_check
    check (operation in ('make_payment','set_up_autopay')),
  constraint bill_payment_intents_status_check
    check (status in ('draft','confirmed','submitted','succeeded','failed','canceled')),
  constraint bill_payment_intents_amount_check
    check (amount is null or amount > 0),
  constraint bill_payment_intents_fixed_amount_check
    check (fixed_amount is null or fixed_amount > 0)
);

create index if not exists bill_payment_intents_user_created_idx
  on public.bill_payment_intents(user_id, created_at desc);
create index if not exists bill_payment_intents_provider_status_idx
  on public.bill_payment_intents(provider_id, status);

alter table public.bill_payment_intents enable row level security;

drop policy if exists "Users can read their own bill payment intents"
  on public.bill_payment_intents;
create policy "Users can read their own bill payment intents"
on public.bill_payment_intents
for select
using (auth.uid() = user_id);

drop policy if exists "Users can create their own bill payment intents"
  on public.bill_payment_intents;
create policy "Users can create their own bill payment intents"
on public.bill_payment_intents
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own unsubmitted bill payment intents"
  on public.bill_payment_intents;
create policy "Users can update their own unsubmitted bill payment intents"
on public.bill_payment_intents
for update
using (auth.uid() = user_id and status in ('draft','confirmed'))
with check (auth.uid() = user_id);

drop trigger if exists set_bill_payment_intents_updated_at
  on public.bill_payment_intents;
create trigger set_bill_payment_intents_updated_at
before update on public.bill_payment_intents
for each row execute function public.set_updated_at();

comment on table public.bill_payment_intents is
  'Explicit customer-authorized payment/autopay operations. Deck write tasks must reference one confirmed intent.';
