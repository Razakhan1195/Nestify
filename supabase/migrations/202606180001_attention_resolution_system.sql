-- Phase 9: Attention resolution system.
-- Safe to run in Supabase SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists public.attention_resolutions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  attention_key text not null,
  event_type text not null,
  related_table text,
  related_id uuid,
  resolution_status text not null default 'open',
  dismissed_at timestamptz,
  handled_at timestamptz,
  snoozed_until timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, home_id, attention_key)
);

alter table public.attention_resolutions
  add column if not exists resolution_status text not null default 'open';
alter table public.attention_resolutions
  add column if not exists dismissed_at timestamptz;
alter table public.attention_resolutions
  add column if not exists handled_at timestamptz;
alter table public.attention_resolutions
  add column if not exists snoozed_until timestamptz;
alter table public.attention_resolutions
  add column if not exists note text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'attention_resolutions_status_check'
      and conrelid = 'public.attention_resolutions'::regclass
  ) then
    alter table public.attention_resolutions
      add constraint attention_resolutions_status_check
      check (resolution_status in ('open', 'dismissed', 'handled', 'snoozed'));
  end if;
end;
$$;

drop trigger if exists set_attention_resolutions_updated_at on public.attention_resolutions;
create trigger set_attention_resolutions_updated_at
before update on public.attention_resolutions
for each row execute function public.set_updated_at();

create index if not exists attention_resolutions_user_home_idx
  on public.attention_resolutions(user_id, home_id);
create index if not exists attention_resolutions_status_idx
  on public.attention_resolutions(resolution_status);
create index if not exists attention_resolutions_snoozed_until_idx
  on public.attention_resolutions(snoozed_until);
create index if not exists attention_resolutions_related_idx
  on public.attention_resolutions(related_table, related_id);

alter table public.attention_resolutions enable row level security;

drop policy if exists "Users can manage their own attention resolutions" on public.attention_resolutions;
create policy "Users can manage their own attention resolutions"
on public.attention_resolutions
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

comment on table public.attention_resolutions is
  'Stores dismiss, handled, and snooze state for generated home attention items without deleting underlying records.';
comment on column public.attention_resolutions.attention_key is
  'Stable generated key for an active attention item.';
comment on column public.attention_resolutions.resolution_status is
  'Resolution state for the generated attention item: open, dismissed, handled, or snoozed.';

notify pgrst, 'reload schema';
