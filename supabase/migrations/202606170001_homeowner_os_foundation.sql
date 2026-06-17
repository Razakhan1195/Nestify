-- Phase 8: Homeowner operating system foundations.
-- Safe to run in Supabase SQL Editor.

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

alter table public.homes add column if not exists square_feet integer;
alter table public.homes add column if not exists bedrooms numeric(4, 1);
alter table public.homes add column if not exists bathrooms numeric(4, 1);
alter table public.homes add column if not exists heating_type text;
alter table public.homes add column if not exists cooling_type text;
alter table public.homes add column if not exists roof_year integer;
alter table public.homes add column if not exists furnace_year integer;
alter table public.homes add column if not exists water_heater_year integer;
alter table public.homes add column if not exists insurance_renewal_date date;
alter table public.homes add column if not exists property_tax_due_date date;
alter table public.homes add column if not exists emergency_contacts jsonb not null default '[]'::jsonb;

alter table public.bills add column if not exists source text not null default 'manual';
alter table public.bills add column if not exists frequency text;
alter table public.bills add column if not exists autopay_status text;
alter table public.bills add column if not exists paid_at timestamptz;

alter table public.maintenance_tasks add column if not exists category text;
alter table public.maintenance_tasks add column if not exists priority text not null default 'normal';
alter table public.maintenance_tasks add column if not exists estimated_cost numeric(12, 2);

alter table public.documents add column if not exists category text;
alter table public.documents add column if not exists tags text[] not null default '{}'::text[];
alter table public.documents add column if not exists pinned boolean not null default false;

-- Reminders are actionable dates across bills, warranties, maintenance, projects, and documents.
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  title text not null,
  reminder_type text not null,
  due_date date,
  status text not null default 'open',
  related_table text,
  related_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Service providers are trusted household contacts such as contractors, HVAC companies, plumbers, and inspectors.
create table if not exists public.service_providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid references public.homes(id) on delete cascade,
  name text not null,
  category text,
  contact_name text,
  phone text,
  email text,
  website_url text,
  preferred boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Inventory items track appliances, equipment, fixtures, and warrantied home assets.
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  name text not null,
  category text,
  room_or_area text,
  brand text,
  model_number text,
  serial_number text,
  purchase_date date,
  purchase_price numeric(12, 2),
  warranty_expires_on date,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Projects track repairs, renovations, upgrades, inspections, and major home history events.
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  service_provider_id uuid references public.service_providers(id) on delete set null,
  title text not null,
  project_type text not null default 'repair',
  room_or_area text,
  status text not null default 'planning',
  priority text not null default 'normal',
  budget numeric(12, 2),
  actual_cost numeric(12, 2),
  started_on date,
  target_completion_on date,
  completed_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Project expenses record quotes, receipts, invoices, materials, and labor costs.
create table if not exists public.project_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  title text not null,
  expense_type text,
  amount numeric(12, 2),
  incurred_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Repair issues capture homeowner problems before they become projects or maintenance tasks.
create table if not exists public.repair_issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  area text,
  description text,
  urgency text not null default 'monitor',
  recommended_action text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Timeline events are the searchable memory layer for bills, uploads, tasks, projects, repairs, and major home events.
create table if not exists public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  event_type text not null,
  title text not null,
  body text,
  occurred_on date not null default current_date,
  related_table text,
  related_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.reminders is 'Actionable reminders for bills, warranties, maintenance, projects, documents, and home follow-ups.';
comment on table public.service_providers is 'Preferred and historical household service contacts.';
comment on table public.inventory_items is 'Appliances, equipment, fixtures, warranties, and important home assets.';
comment on table public.projects is 'Repairs, renovations, upgrades, inspections, and major home work.';
comment on table public.project_expenses is 'Costs, receipts, invoices, quotes, and materials attached to projects.';
comment on table public.repair_issues is 'Home issues that may become tasks, projects, or service requests.';
comment on table public.timeline_events is 'Chronological home history and search memory events.';

drop trigger if exists set_reminders_updated_at on public.reminders;
create trigger set_reminders_updated_at
before update on public.reminders
for each row execute function public.set_updated_at();

drop trigger if exists set_service_providers_updated_at on public.service_providers;
create trigger set_service_providers_updated_at
before update on public.service_providers
for each row execute function public.set_updated_at();

drop trigger if exists set_inventory_items_updated_at on public.inventory_items;
create trigger set_inventory_items_updated_at
before update on public.inventory_items
for each row execute function public.set_updated_at();

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists set_project_expenses_updated_at on public.project_expenses;
create trigger set_project_expenses_updated_at
before update on public.project_expenses
for each row execute function public.set_updated_at();

drop trigger if exists set_repair_issues_updated_at on public.repair_issues;
create trigger set_repair_issues_updated_at
before update on public.repair_issues
for each row execute function public.set_updated_at();

drop trigger if exists set_timeline_events_updated_at on public.timeline_events;
create trigger set_timeline_events_updated_at
before update on public.timeline_events
for each row execute function public.set_updated_at();

create index if not exists bills_source_idx on public.bills(source);
create index if not exists bills_paid_at_idx on public.bills(paid_at);
create index if not exists documents_category_idx on public.documents(category);
create index if not exists maintenance_tasks_category_idx on public.maintenance_tasks(category);
create index if not exists reminders_user_id_idx on public.reminders(user_id);
create index if not exists reminders_home_id_idx on public.reminders(home_id);
create index if not exists reminders_due_date_idx on public.reminders(due_date);
create index if not exists service_providers_user_id_idx on public.service_providers(user_id);
create index if not exists service_providers_home_id_idx on public.service_providers(home_id);
create index if not exists inventory_items_user_id_idx on public.inventory_items(user_id);
create index if not exists inventory_items_home_id_idx on public.inventory_items(home_id);
create index if not exists inventory_items_warranty_expires_on_idx on public.inventory_items(warranty_expires_on);
create index if not exists projects_user_id_idx on public.projects(user_id);
create index if not exists projects_home_id_idx on public.projects(home_id);
create index if not exists projects_status_idx on public.projects(status);
create index if not exists project_expenses_user_id_idx on public.project_expenses(user_id);
create index if not exists project_expenses_home_id_idx on public.project_expenses(home_id);
create index if not exists project_expenses_project_id_idx on public.project_expenses(project_id);
create index if not exists repair_issues_user_id_idx on public.repair_issues(user_id);
create index if not exists repair_issues_home_id_idx on public.repair_issues(home_id);
create index if not exists repair_issues_status_idx on public.repair_issues(status);
create index if not exists timeline_events_user_id_idx on public.timeline_events(user_id);
create index if not exists timeline_events_home_id_idx on public.timeline_events(home_id);
create index if not exists timeline_events_occurred_on_idx on public.timeline_events(occurred_on);

alter table public.reminders enable row level security;
alter table public.service_providers enable row level security;
alter table public.inventory_items enable row level security;
alter table public.projects enable row level security;
alter table public.project_expenses enable row level security;
alter table public.repair_issues enable row level security;
alter table public.timeline_events enable row level security;

drop policy if exists "Users can manage their own reminders" on public.reminders;
create policy "Users can manage their own reminders"
on public.reminders
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can manage their own service providers" on public.service_providers;
create policy "Users can manage their own service providers"
on public.service_providers
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can manage their own inventory items" on public.inventory_items;
create policy "Users can manage their own inventory items"
on public.inventory_items
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can manage their own projects" on public.projects;
create policy "Users can manage their own projects"
on public.projects
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can manage their own project expenses" on public.project_expenses;
create policy "Users can manage their own project expenses"
on public.project_expenses
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can manage their own repair issues" on public.repair_issues;
create policy "Users can manage their own repair issues"
on public.repair_issues
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can manage their own timeline events" on public.timeline_events;
create policy "Users can manage their own timeline events"
on public.timeline_events
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

notify pgrst, 'reload schema';
