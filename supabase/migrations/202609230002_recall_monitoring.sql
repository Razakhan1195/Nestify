create table public.recall_preferences (
 user_id uuid not null references auth.users(id) on delete cascade,
 home_id uuid not null references public.homes(id) on delete cascade,
 enabled boolean not null default false,
 push_enabled boolean not null default false,
 next_check_at timestamptz not null default now(),
 last_checked_at timestamptz,
 last_error text,
 primary key(user_id, home_id),
 check (not push_enabled or enabled)
);
alter table public.recall_preferences enable row level security;
create policy "Read own recall preferences" on public.recall_preferences for select
using (auth.uid() = user_id and exists(select 1 from public.homes h where h.id=home_id and h.user_id=auth.uid()));
create policy "Create own recall preferences" on public.recall_preferences for insert
with check (auth.uid() = user_id and exists(select 1 from public.homes h where h.id=home_id and h.user_id=auth.uid()));
create policy "Update own recall preferences" on public.recall_preferences for update
using (auth.uid() = user_id and exists(select 1 from public.homes h where h.id=home_id and h.user_id=auth.uid()))
with check (auth.uid() = user_id and exists(select 1 from public.homes h where h.id=home_id and h.user_id=auth.uid()));
create index recall_preferences_due on public.recall_preferences(next_check_at) where enabled;

create table public.recall_deliveries (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 home_id uuid not null references public.homes(id) on delete cascade,
 device_id uuid references public.device_push_tokens(id) on delete set null,
 status text not null check(status in ('sending','accepted','provider_accepted','failed','uncertain','suppressed')),
 ticket_id text,
 dedupe_key text unique,
 created_at timestamptz not null default now(),
 receipt_checked_at timestamptz
);
alter table public.recall_deliveries enable row level security;
create policy "Read own recall deliveries" on public.recall_deliveries for select using(auth.uid()=user_id);
create index recall_deliveries_receipts on public.recall_deliveries(created_at) where status in ('sending','accepted');

create table public.recall_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 home_id uuid not null references public.homes(id) on delete cascade,
 item_id uuid not null references public.inventory_items(id) on delete cascade,
 attention_key text not null,
 status text not null check(status in ('pending','in_app','suppressed','claimed')),
 delivery_id uuid references public.recall_deliveries(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(user_id,home_id,attention_key)
);
alter table public.recall_events enable row level security;
create policy "Read own recall events" on public.recall_events for select using(auth.uid()=user_id);
create index recall_events_pending on public.recall_events(user_id,home_id) where status='pending';
