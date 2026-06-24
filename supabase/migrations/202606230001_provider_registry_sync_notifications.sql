-- Phase 12: Provider registry, sync cadence, notifications, and manual bill fallback.
-- Safe to run in Supabase SQL Editor after provider intelligence and Deck sync migrations.

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

create table if not exists public.provider_registry (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  utility_type text not null,
  province_region text,
  website_url text,
  deck_provider_id text,
  status text not null default 'needs_mapping',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'provider_registry_status_check'
      and conrelid = 'public.provider_registry'::regclass
  ) then
    alter table public.provider_registry
      add constraint provider_registry_status_check
      check (status in ('active', 'coming_soon', 'unsupported', 'needs_mapping'));
  end if;
end;
$$;

create unique index if not exists provider_registry_name_type_region_uidx
  on public.provider_registry (name, utility_type, coalesce(province_region, ''));

alter table public.providers add column if not exists registry_provider_id uuid references public.provider_registry(id) on delete set null;
alter table public.providers add column if not exists sync_frequency_days integer not null default 30;
alter table public.providers add column if not exists next_scheduled_sync_at timestamptz;
alter table public.providers add column if not exists sync_status text not null default 'manual';
alter table public.providers add column if not exists sync_failure_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'providers_sync_frequency_days_check'
      and conrelid = 'public.providers'::regclass
  ) then
    alter table public.providers
      add constraint providers_sync_frequency_days_check
      check (sync_frequency_days in (15, 30));
  end if;
end;
$$;

alter table public.bills add column if not exists provider_connection_id uuid references public.providers(id) on delete set null;
alter table public.bills add column if not exists custom_provider_name text;
alter table public.bills add column if not exists amount_paid numeric(12, 2);
alter table public.bills add column if not exists payment_status text not null default 'unpaid';
alter table public.bills add column if not exists reminder_date date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bills_payment_status_check'
      and conrelid = 'public.bills'::regclass
  ) then
    alter table public.bills
      add constraint bills_payment_status_check
      check (payment_status in ('unpaid', 'scheduled', 'paid', 'overdue'));
  end if;
end;
$$;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text,
  href text,
  status text not null default 'unread',
  related_table text,
  related_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notifications_status_check'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_status_check
      check (status in ('unread', 'read'));
  end if;
end;
$$;

create table if not exists public.provider_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  run_type text not null default 'manual',
  status text not null default 'started',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_provider_registry_updated_at on public.provider_registry;
create trigger set_provider_registry_updated_at
before update on public.provider_registry
for each row execute function public.set_updated_at();

drop trigger if exists set_notifications_updated_at on public.notifications;
create trigger set_notifications_updated_at
before update on public.notifications
for each row execute function public.set_updated_at();

drop trigger if exists set_provider_sync_runs_updated_at on public.provider_sync_runs;
create trigger set_provider_sync_runs_updated_at
before update on public.provider_sync_runs
for each row execute function public.set_updated_at();

create index if not exists provider_registry_utility_type_idx on public.provider_registry(utility_type);
create index if not exists provider_registry_status_idx on public.provider_registry(status);
create index if not exists providers_registry_provider_id_idx on public.providers(registry_provider_id);
create index if not exists providers_next_scheduled_sync_at_idx on public.providers(next_scheduled_sync_at);
create index if not exists providers_sync_status_idx on public.providers(sync_status);
create index if not exists bills_provider_connection_id_idx on public.bills(provider_connection_id);
create index if not exists bills_payment_status_idx on public.bills(payment_status);
create index if not exists bills_reminder_date_idx on public.bills(reminder_date);
create index if not exists notifications_user_home_status_idx on public.notifications(user_id, home_id, status);
create index if not exists notifications_created_at_idx on public.notifications(created_at);
create index if not exists provider_sync_runs_provider_id_idx on public.provider_sync_runs(provider_id);
create index if not exists provider_sync_runs_status_idx on public.provider_sync_runs(status);

alter table public.provider_registry enable row level security;
alter table public.notifications enable row level security;
alter table public.provider_sync_runs enable row level security;

drop policy if exists "Provider registry is readable by authenticated users" on public.provider_registry;
create policy "Provider registry is readable by authenticated users"
on public.provider_registry
for select
to authenticated
using (true);

drop policy if exists "Users can manage their own notifications" on public.notifications;
create policy "Users can manage their own notifications"
on public.notifications
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can manage their own provider sync runs" on public.provider_sync_runs;
create policy "Users can manage their own provider sync runs"
on public.provider_sync_runs
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

insert into public.provider_registry (name, utility_type, province_region, website_url, deck_provider_id, status, metadata)
values
  ('Toronto Hydro', 'Electricity', 'Ontario', 'https://www.torontohydro.com', null, 'needs_mapping', '{}'::jsonb),
  ('Hydro One', 'Electricity', 'Ontario', 'https://www.hydroone.com', null, 'needs_mapping', '{}'::jsonb),
  ('Alectra Utilities', 'Electricity', 'Ontario', 'https://alectrautilities.com', null, 'needs_mapping', '{}'::jsonb),
  ('Elexicon Energy', 'Electricity', 'Ontario', 'https://elexiconenergy.com', null, 'needs_mapping', '{}'::jsonb),
  ('EPCOR', 'Electricity', 'Alberta / Ontario', 'https://www.epcor.com', null, 'needs_mapping', '{}'::jsonb),
  ('FortisBC', 'Natural Gas', 'British Columbia', 'https://www.fortisbc.com', null, 'needs_mapping', '{}'::jsonb),
  ('BC Hydro', 'Electricity', 'British Columbia', 'https://www.bchydro.com', null, 'needs_mapping', '{}'::jsonb),
  ('Hydro-Québec', 'Electricity', 'Quebec', 'https://www.hydroquebec.com', null, 'needs_mapping', '{}'::jsonb),
  ('Énergir', 'Natural Gas', 'Quebec', 'https://www.energir.com', null, 'needs_mapping', '{}'::jsonb),
  ('Manitoba Hydro', 'Electricity', 'Manitoba', 'https://www.hydro.mb.ca', null, 'needs_mapping', '{}'::jsonb),
  ('SaskPower', 'Electricity', 'Saskatchewan', 'https://www.saskpower.com', null, 'needs_mapping', '{}'::jsonb),
  ('SaskEnergy', 'Natural Gas', 'Saskatchewan', 'https://www.saskenergy.com', null, 'needs_mapping', '{}'::jsonb),
  ('ATCO', 'Natural Gas', 'Alberta', 'https://www.atco.com', null, 'needs_mapping', '{}'::jsonb),
  ('ENMAX', 'Electricity', 'Alberta', 'https://www.enmax.com', null, 'needs_mapping', '{}'::jsonb),
  ('Enbridge Gas', 'Natural Gas', 'Ontario', 'https://www.enbridgegas.com', null, 'needs_mapping', '{}'::jsonb),
  ('City of Toronto Water', 'Water', 'Ontario', 'https://www.toronto.ca/services-payments/water-environment', null, 'needs_mapping', '{}'::jsonb),
  ('Region of Durham Water', 'Water', 'Ontario', 'https://www.durham.ca/en/living-here/water-billing.aspx', null, 'active', '{"deck_source_id_env":"DECK_DURHAM_WATER_SOURCE_ID","deck_task_id_env":"DECK_DURHAM_WATER_TASK_ID"}'::jsonb),
  ('Rogers', 'Internet', 'Canada', 'https://www.rogers.com', null, 'needs_mapping', '{}'::jsonb),
  ('Bell', 'Internet', 'Canada', 'https://www.bell.ca', null, 'needs_mapping', '{}'::jsonb),
  ('Telus', 'Internet', 'Canada', 'https://www.telus.com', null, 'needs_mapping', '{}'::jsonb),
  ('Fido', 'Mobile', 'Canada', 'https://www.fido.ca', null, 'coming_soon', '{}'::jsonb),
  ('Koodo', 'Mobile', 'Canada', 'https://www.koodomobile.com', null, 'coming_soon', '{}'::jsonb),
  ('Virgin Plus', 'Mobile', 'Canada', 'https://www.virginplus.ca', null, 'coming_soon', '{}'::jsonb),
  ('Freedom Mobile', 'Mobile', 'Canada', 'https://www.freedommobile.ca', null, 'coming_soon', '{}'::jsonb),
  ('TekSavvy', 'Internet', 'Canada', 'https://www.teksavvy.com', null, 'needs_mapping', '{}'::jsonb),
  ('Cogeco', 'Internet', 'Ontario / Quebec', 'https://www.cogeco.ca', null, 'needs_mapping', '{}'::jsonb),
  ('Videotron', 'Internet', 'Quebec', 'https://videotron.com', null, 'needs_mapping', '{}'::jsonb),
  ('Shaw / Rogers', 'Internet', 'Western Canada', 'https://www.rogers.com/shaw', null, 'needs_mapping', '{}'::jsonb),
  ('The Co-operators', 'Home Insurance', 'Canada', 'https://www.cooperators.ca', null, 'coming_soon', '{}'::jsonb),
  ('Intact', 'Home Insurance', 'Canada', 'https://www.intact.ca', null, 'coming_soon', '{}'::jsonb),
  ('Aviva', 'Home Insurance', 'Canada', 'https://www.aviva.ca', null, 'coming_soon', '{}'::jsonb),
  ('TD Insurance', 'Home Insurance', 'Canada', 'https://www.tdinsurance.com', null, 'coming_soon', '{}'::jsonb),
  ('Sonnet', 'Home Insurance', 'Canada', 'https://www.sonnet.ca', null, 'coming_soon', '{}'::jsonb),
  ('Square One', 'Home Insurance', 'Canada', 'https://www.squareone.ca', null, 'coming_soon', '{}'::jsonb),
  ('Town of Pickering Property Tax', 'Property Tax', 'Ontario', 'https://www.pickering.ca', null, 'needs_mapping', '{}'::jsonb),
  ('Town of Whitby Property Tax', 'Property Tax', 'Ontario', 'https://www.whitby.ca', null, 'needs_mapping', '{}'::jsonb),
  ('City of Toronto Property Tax', 'Property Tax', 'Ontario', 'https://www.toronto.ca/services-payments/property-taxes-utilities', null, 'needs_mapping', '{}'::jsonb),
  ('City of Mississauga Property Tax', 'Property Tax', 'Ontario', 'https://www.mississauga.ca/services-and-programs/property-taxes', null, 'needs_mapping', '{}'::jsonb),
  ('Enercare', 'Other Home Services', 'Ontario', 'https://www.enercare.ca', null, 'needs_mapping', '{}'::jsonb),
  ('Reliance Home Comfort', 'Other Home Services', 'Canada', 'https://reliancehomecomfort.com', null, 'needs_mapping', '{}'::jsonb),
  ('Bell Smart Home', 'Other Home Services', 'Canada', 'https://bell.ca/smart-home', null, 'coming_soon', '{}'::jsonb),
  ('Telus SmartHome Security', 'Other Home Services', 'Canada', 'https://www.telus.com/en/smarthome-security', null, 'coming_soon', '{}'::jsonb),
  ('GFL Environmental', 'Other Home Services', 'Canada', 'https://gflenv.com', null, 'needs_mapping', '{}'::jsonb),
  ('Waste Connections', 'Other Home Services', 'Canada', 'https://www.wasteconnectionscanada.com', null, 'needs_mapping', '{}'::jsonb)
on conflict do nothing;

update public.provider_registry
set
  website_url = case name
    when 'Toronto Hydro' then 'https://www.torontohydro.com/for-home/customer-service/my-toronto-hydro'
    when 'Hydro One' then 'https://myaccount.hydroone.com/'
    when 'Alectra Utilities' then 'https://myaccount.alectrautilities.com/'
    when 'Elexicon Energy' then 'https://myaccount.elexiconenergy.com/'
    when 'EPCOR' then 'https://myaccount.epcor.com/'
    when 'FortisBC' then 'https://accounts.fortisbc.com/'
    when 'BC Hydro' then 'https://app.bchydro.com/accounts-billing/login.html'
    when 'Hydro-Québec' then 'https://session.hydroquebec.com/'
    when 'Énergir' then 'https://www.energir.com/en/customer-space/'
    when 'Manitoba Hydro' then 'https://account.hydro.mb.ca/'
    when 'SaskPower' then 'https://www.saskpower.com/accounts-and-services/my-saskpower'
    when 'SaskEnergy' then 'https://myaccount.saskenergy.com/'
    when 'ATCO' then 'https://myaccount.atco.com/'
    when 'ENMAX' then 'https://www.enmax.com/sign-in'
    when 'Enbridge Gas' then 'https://myaccount.enbridgegas.com/'
    when 'City of Toronto Water' then 'https://www.toronto.ca/services-payments/property-taxes-utilities/'
    when 'Region of Durham Water' then 'https://secure6.i-doxs.net/RegionOfDurham/Secure/ViewBill.aspx'
    when 'Rogers' then 'https://www.rogers.com/signin'
    when 'Bell' then 'https://mybell.bell.ca/'
    when 'Telus' then 'https://www.telus.com/my-telus'
    when 'Fido' then 'https://www.fido.ca/signin'
    when 'Koodo' then 'https://www.koodomobile.com/en/login'
    when 'Virgin Plus' then 'https://www.virginplus.ca/en/login.html'
    when 'Freedom Mobile' then 'https://www.freedommobile.ca/login'
    when 'TekSavvy' then 'https://myaccount.teksavvy.com/'
    when 'Cogeco' then 'https://www.cogeco.ca/en/my-account'
    when 'Videotron' then 'https://moncompte.videotron.com/'
    when 'Shaw / Rogers' then 'https://www.rogers.com/signin'
    when 'The Co-operators' then 'https://www.cooperators.ca/en/login.aspx'
    when 'Intact' then 'https://www.intact.ca/on/en/personal-insurance/login.html'
    when 'Aviva' then 'https://www.aviva.ca/en/customer-care/myaviva/'
    when 'TD Insurance' then 'https://www.tdinsurance.com/login'
    when 'Sonnet' then 'https://www.sonnet.ca/sign-in'
    when 'Square One' then 'https://www.squareone.ca/account/login'
    when 'Town of Pickering Property Tax' then 'https://online.pickering.ca/eproperty/'
    when 'Town of Whitby Property Tax' then 'https://my.whitby.ca/'
    when 'City of Toronto Property Tax' then 'https://www.toronto.ca/services-payments/property-taxes-utilities/'
    when 'City of Mississauga Property Tax' then 'https://tax.mississauga.ca/'
    when 'Enercare' then 'https://myaccount.enercare.ca/'
    when 'Reliance Home Comfort' then 'https://myaccount.reliancehomecomfort.com/'
    when 'Bell Smart Home' then 'https://mybell.bell.ca/'
    when 'Telus SmartHome Security' then 'https://www.telus.com/my-telus'
    when 'GFL Environmental' then 'https://myaccount.gflenv.com/'
    when 'Waste Connections' then 'https://www.wasteconnectionscanada.com/customer-login/'
    else website_url
  end,
  metadata = case
    when name = 'Region of Durham Water' then
      metadata || '{"deck_agent_id_env":"DECK_DURHAM_WATER_AGENT_ID"}'::jsonb
    else metadata
  end,
  updated_at = now()
where name in (
  'Toronto Hydro',
  'Hydro One',
  'Alectra Utilities',
  'Elexicon Energy',
  'EPCOR',
  'FortisBC',
  'BC Hydro',
  'Hydro-Québec',
  'Énergir',
  'Manitoba Hydro',
  'SaskPower',
  'SaskEnergy',
  'ATCO',
  'ENMAX',
  'Enbridge Gas',
  'City of Toronto Water',
  'Region of Durham Water',
  'Rogers',
  'Bell',
  'Telus',
  'Fido',
  'Koodo',
  'Virgin Plus',
  'Freedom Mobile',
  'TekSavvy',
  'Cogeco',
  'Videotron',
  'Shaw / Rogers',
  'The Co-operators',
  'Intact',
  'Aviva',
  'TD Insurance',
  'Sonnet',
  'Square One',
  'Town of Pickering Property Tax',
  'Town of Whitby Property Tax',
  'City of Toronto Property Tax',
  'City of Mississauga Property Tax',
  'Enercare',
  'Reliance Home Comfort',
  'Bell Smart Home',
  'Telus SmartHome Security',
  'GFL Environmental',
  'Waste Connections'
);

comment on table public.provider_registry is 'Canonical Canadian provider registry used to select real providers before creating a user provider connection.';
comment on column public.provider_registry.status is 'active means selectable for current connection work; needs_mapping means the provider is known but needs Deck mapping; coming_soon is visible but not automated yet; unsupported is disabled.';
comment on column public.providers.sync_frequency_days is 'User-selected refresh cadence for provider syncs. Current supported values are 15 and 30 days.';
comment on column public.providers.next_scheduled_sync_at is 'Next scheduled provider refresh timestamp.';
comment on table public.notifications is 'In-app notifications for async provider sync outcomes and home follow-ups.';
comment on table public.provider_sync_runs is 'Provider sync run history for manual and scheduled refreshes.';

notify pgrst, 'reload schema';
