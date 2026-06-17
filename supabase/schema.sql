-- Dwellwise Phase 2 database schema.
-- Run this in Supabase SQL editor or through your Supabase migration workflow.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Profiles store one application profile per authenticated Supabase user.
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Homes represent a user's household or property.
create table if not exists public.homes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null,
  street_address text,
  city text,
  province text,
  postal_code text,
  country text default 'Canada',
  home_type text,
  ownership_type text,
  closing_date date,
  approximate_year_built integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.homes add column if not exists nickname text;
alter table public.homes add column if not exists street_address text;
alter table public.homes add column if not exists city text;
alter table public.homes add column if not exists province text;
alter table public.homes add column if not exists postal_code text;
alter table public.homes add column if not exists country text default 'Canada';
alter table public.homes add column if not exists home_type text;
alter table public.homes add column if not exists ownership_type text;
alter table public.homes add column if not exists closing_date date;
alter table public.homes add column if not exists approximate_year_built integer;
alter table public.homes add column if not exists created_at timestamptz default now();
alter table public.homes add column if not exists updated_at timestamptz default now();

alter table public.homes alter column country set default 'Canada';
alter table public.homes alter column created_at set default now();
alter table public.homes alter column updated_at set default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'homes'
      and column_name = 'name'
  ) then
    update public.homes
    set nickname = coalesce(nullif(nickname, ''), nullif(name, ''), 'Home')
    where nickname is null or nickname = '';

    alter table public.homes alter column name drop not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'homes'
      and column_name = 'address_line_1'
  ) then
    update public.homes
    set street_address = address_line_1
    where street_address is null and address_line_1 is not null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'homes'
      and column_name = 'region'
  ) then
    update public.homes
    set province = region
    where province is null and region is not null;
  end if;
end;
$$;

update public.homes
set nickname = 'Home'
where nickname is null or nickname = '';
alter table public.homes alter column nickname set not null;

-- Provider categories are shared labels used to organize utilities, taxes, insurance, and other providers.
create table if not exists public.provider_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Providers store the companies, agencies, subscriptions, and contacts attached to a user's home.
create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  category_id uuid references public.provider_categories(id) on delete set null,
  name text not null,
  display_name text,
  provider_priority integer,
  connection_status text not null default 'added_manual',
  health_status text not null default 'needs_attention',
  last_successful_sync_at timestamptz,
  next_expected_bill_date date,
  sync_frequency text,
  requires_user_action boolean not null default false,
  user_action_message text,
  data_capabilities jsonb not null default '{}'::jsonb,
  deck_connection_id text,
  deck_connection_status text,
  deck_connection_metadata jsonb not null default '{}'::jsonb,
  account_number text,
  website_url text,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.providers add column if not exists display_name text;
alter table public.providers add column if not exists provider_priority integer;
alter table public.providers add column if not exists connection_status text not null default 'added_manual';
alter table public.providers add column if not exists health_status text not null default 'needs_attention';
alter table public.providers add column if not exists last_successful_sync_at timestamptz;
alter table public.providers add column if not exists next_expected_bill_date date;
alter table public.providers add column if not exists sync_frequency text;
alter table public.providers add column if not exists requires_user_action boolean not null default false;
alter table public.providers add column if not exists user_action_message text;
alter table public.providers add column if not exists data_capabilities jsonb not null default '{}'::jsonb;
alter table public.providers add column if not exists deck_connection_id text;
alter table public.providers add column if not exists deck_connection_status text;
alter table public.providers add column if not exists deck_connection_metadata jsonb not null default '{}'::jsonb;

-- Bills track recurring and one-off household payment obligations.
create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  provider_id uuid references public.providers(id) on delete set null,
  external_bill_id text,
  name text not null,
  amount numeric(12, 2),
  currency text not null default 'CAD',
  due_date date,
  issue_date date,
  billing_period_start date,
  billing_period_end date,
  account_number_masked text,
  usage_amount numeric(12, 2),
  usage_unit text,
  previous_balance numeric(12, 2),
  pdf_available boolean not null default false,
  line_items jsonb not null default '[]'::jsonb,
  detected_fees jsonb not null default '[]'::jsonb,
  raw_data jsonb not null default '{}'::jsonb,
  recurrence text,
  status text not null default 'upcoming',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bills add column if not exists external_bill_id text;
alter table public.bills add column if not exists issue_date date;
alter table public.bills add column if not exists billing_period_start date;
alter table public.bills add column if not exists billing_period_end date;
alter table public.bills add column if not exists account_number_masked text;
alter table public.bills add column if not exists usage_amount numeric(12, 2);
alter table public.bills add column if not exists usage_unit text;
alter table public.bills add column if not exists previous_balance numeric(12, 2);
alter table public.bills add column if not exists pdf_available boolean not null default false;
alter table public.bills add column if not exists line_items jsonb not null default '[]'::jsonb;
alter table public.bills add column if not exists detected_fees jsonb not null default '[]'::jsonb;
alter table public.bills add column if not exists raw_data jsonb not null default '{}'::jsonb;

-- Documents store metadata for household files such as policies, warranties, contracts, and receipts.
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  provider_id uuid references public.providers(id) on delete set null,
  external_document_id text,
  title text not null,
  document_type text,
  storage_path text,
  source text,
  file_name text,
  mime_type text,
  file_size_bytes bigint,
  issued_on date,
  expires_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.documents add column if not exists external_document_id text;
alter table public.documents add column if not exists source text;

-- Maintenance tasks track recurring upkeep, repairs, and seasonal home work.
create table if not exists public.maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  provider_id uuid references public.providers(id) on delete set null,
  title text not null,
  description text,
  due_date date,
  recurrence text,
  status text not null default 'open',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Insights store generated or curated observations about a user's home operations.
create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid references public.homes(id) on delete cascade,
  title text not null,
  body text not null,
  insight_type text,
  source text,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sync events record imports, refreshes, and integration activity for auditability.
create table if not exists public.sync_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid references public.homes(id) on delete cascade,
  provider_id uuid references public.providers(id) on delete set null,
  source text not null,
  status text not null default 'pending',
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Monthly summaries store per-home monthly rollups for bills, maintenance, documents, and insights.
create table if not exists public.monthly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  month date not null,
  total_bills_amount numeric(12, 2) not null default 0,
  bills_due_count integer not null default 0,
  maintenance_open_count integer not null default 0,
  documents_added_count integer not null default 0,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, home_id, month)
);

insert into public.provider_categories (name)
values
  ('Electricity'),
  ('Natural Gas'),
  ('Water'),
  ('Internet'),
  ('Home Insurance'),
  ('Property Tax'),
  ('Security'),
  ('Water Heater Rental'),
  ('Waste'),
  ('Other')
on conflict (name) do nothing;

comment on table public.profiles is 'Stores one application profile per authenticated Supabase user.';
comment on table public.homes is 'Represents a household or property managed by a user.';
comment on table public.provider_categories is 'Shared provider category labels for utilities, insurance, taxes, and other household providers.';
comment on table public.providers is 'Stores user-owned companies, agencies, subscriptions, and household contacts.';
comment on table public.bills is 'Tracks recurring and one-off household payment obligations.';
comment on table public.documents is 'Stores metadata for household files such as policies, warranties, contracts, and receipts.';
comment on table public.maintenance_tasks is 'Tracks recurring upkeep, repairs, and seasonal home work.';
comment on table public.insights is 'Stores generated or curated observations about a user home.';
comment on table public.sync_events is 'Records imports, refreshes, and integration activity for auditability.';
comment on table public.monthly_summaries is 'Stores per-home monthly rollups for bills, maintenance, documents, and insights.';

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_homes_updated_at on public.homes;
create trigger set_homes_updated_at
before update on public.homes
for each row execute function public.set_updated_at();

drop trigger if exists set_provider_categories_updated_at on public.provider_categories;
create trigger set_provider_categories_updated_at
before update on public.provider_categories
for each row execute function public.set_updated_at();

drop trigger if exists set_providers_updated_at on public.providers;
create trigger set_providers_updated_at
before update on public.providers
for each row execute function public.set_updated_at();

drop trigger if exists set_bills_updated_at on public.bills;
create trigger set_bills_updated_at
before update on public.bills
for each row execute function public.set_updated_at();

drop trigger if exists set_documents_updated_at on public.documents;
create trigger set_documents_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

drop trigger if exists set_maintenance_tasks_updated_at on public.maintenance_tasks;
create trigger set_maintenance_tasks_updated_at
before update on public.maintenance_tasks
for each row execute function public.set_updated_at();

drop trigger if exists set_insights_updated_at on public.insights;
create trigger set_insights_updated_at
before update on public.insights
for each row execute function public.set_updated_at();

drop trigger if exists set_sync_events_updated_at on public.sync_events;
create trigger set_sync_events_updated_at
before update on public.sync_events
for each row execute function public.set_updated_at();

drop trigger if exists set_monthly_summaries_updated_at on public.monthly_summaries;
create trigger set_monthly_summaries_updated_at
before update on public.monthly_summaries
for each row execute function public.set_updated_at();

create index if not exists profiles_user_id_idx on public.profiles(user_id);
create index if not exists homes_user_id_idx on public.homes(user_id);
create index if not exists homes_created_at_idx on public.homes(created_at);
create index if not exists providers_user_id_idx on public.providers(user_id);
create index if not exists providers_home_id_idx on public.providers(home_id);
create index if not exists providers_category_id_idx on public.providers(category_id);
create index if not exists providers_provider_priority_idx on public.providers(provider_priority);
create index if not exists providers_connection_status_idx on public.providers(connection_status);
create index if not exists providers_health_status_idx on public.providers(health_status);
create index if not exists providers_next_expected_bill_date_idx on public.providers(next_expected_bill_date);
create index if not exists providers_last_successful_sync_at_idx on public.providers(last_successful_sync_at);
create index if not exists providers_deck_connection_id_idx on public.providers(deck_connection_id);
create index if not exists bills_user_id_idx on public.bills(user_id);
create index if not exists bills_home_id_idx on public.bills(home_id);
create index if not exists bills_provider_id_idx on public.bills(provider_id);
create index if not exists bills_due_date_idx on public.bills(due_date);
create index if not exists bills_external_bill_id_idx on public.bills(external_bill_id);
create unique index if not exists bills_provider_external_bill_id_uidx on public.bills(provider_id, external_bill_id) where external_bill_id is not null;
create index if not exists documents_user_id_idx on public.documents(user_id);
create index if not exists documents_home_id_idx on public.documents(home_id);
create index if not exists documents_provider_id_idx on public.documents(provider_id);
create index if not exists documents_expires_on_idx on public.documents(expires_on);
create index if not exists documents_external_document_id_idx on public.documents(external_document_id);
create unique index if not exists documents_provider_external_document_id_uidx on public.documents(provider_id, external_document_id) where external_document_id is not null;
create index if not exists maintenance_tasks_user_id_idx on public.maintenance_tasks(user_id);
create index if not exists maintenance_tasks_home_id_idx on public.maintenance_tasks(home_id);
create index if not exists maintenance_tasks_provider_id_idx on public.maintenance_tasks(provider_id);
create index if not exists maintenance_tasks_due_date_idx on public.maintenance_tasks(due_date);
create index if not exists insights_user_id_idx on public.insights(user_id);
create index if not exists insights_home_id_idx on public.insights(home_id);
create index if not exists sync_events_user_id_idx on public.sync_events(user_id);
create index if not exists sync_events_home_id_idx on public.sync_events(home_id);
create index if not exists sync_events_provider_id_idx on public.sync_events(provider_id);
create index if not exists monthly_summaries_user_id_idx on public.monthly_summaries(user_id);
create index if not exists monthly_summaries_home_id_idx on public.monthly_summaries(home_id);
create index if not exists monthly_summaries_month_idx on public.monthly_summaries(month);

alter table public.profiles enable row level security;
alter table public.homes enable row level security;
alter table public.provider_categories enable row level security;
alter table public.providers enable row level security;
alter table public.bills enable row level security;
alter table public.documents enable row level security;
alter table public.maintenance_tasks enable row level security;
alter table public.insights enable row level security;
alter table public.sync_events enable row level security;
alter table public.monthly_summaries enable row level security;

drop policy if exists "Provider categories are readable by authenticated users" on public.provider_categories;
create policy "Provider categories are readable by authenticated users"
on public.provider_categories
for select
to authenticated
using (true);

drop policy if exists "Users can manage their own profiles" on public.profiles;
create policy "Users can manage their own profiles"
on public.profiles
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can manage their own homes" on public.homes;
drop policy if exists "Users can select their own homes" on public.homes;
create policy "Users can select their own homes"
on public.homes
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can insert their own homes" on public.homes;
create policy "Users can insert their own homes"
on public.homes
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update their own homes" on public.homes;
create policy "Users can update their own homes"
on public.homes
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete their own homes" on public.homes;
create policy "Users can delete their own homes"
on public.homes
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can manage their own providers" on public.providers;
create policy "Users can manage their own providers"
on public.providers
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can manage their own bills" on public.bills;
create policy "Users can manage their own bills"
on public.bills
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can manage their own documents" on public.documents;
create policy "Users can manage their own documents"
on public.documents
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can manage their own maintenance tasks" on public.maintenance_tasks;
create policy "Users can manage their own maintenance tasks"
on public.maintenance_tasks
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can manage their own insights" on public.insights;
create policy "Users can manage their own insights"
on public.insights
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can manage their own sync events" on public.sync_events;
create policy "Users can manage their own sync events"
on public.sync_events
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can manage their own monthly summaries" on public.monthly_summaries;
create policy "Users can manage their own monthly summaries"
on public.monthly_summaries
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

notify pgrst, 'reload schema';
