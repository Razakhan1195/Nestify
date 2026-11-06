create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'device_push_tokens_platform_check'
      and conrelid = 'public.device_push_tokens'::regclass
  ) then
    alter table public.device_push_tokens
      add constraint device_push_tokens_platform_check
      check (platform in ('ios', 'android'));
  end if;
end;
$$;

create index if not exists device_push_tokens_user_enabled_idx
  on public.device_push_tokens(user_id, enabled);

alter table public.device_push_tokens enable row level security;

drop policy if exists "Users can manage their own push tokens"
  on public.device_push_tokens;
create policy "Users can manage their own push tokens"
on public.device_push_tokens
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop trigger if exists set_device_push_tokens_updated_at
  on public.device_push_tokens;
create trigger set_device_push_tokens_updated_at
before update on public.device_push_tokens
for each row execute function public.set_updated_at();

comment on table public.device_push_tokens is
  'Expo push tokens registered by Rezlee mobile devices for async provider sync notifications.';
