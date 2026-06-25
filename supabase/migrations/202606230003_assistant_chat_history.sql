-- Phase 14: Assistant chat history and saved conversations.
-- Safe to run in Supabase SQL Editor after AI usage controls.

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

create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  title text not null default 'New assistant chat',
  summary text,
  is_saved boolean not null default false,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  role text not null,
  content text not null,
  message_order integer not null,
  source_message_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, message_order)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assistant_messages_role_check'
      and conrelid = 'public.assistant_messages'::regclass
  ) then
    alter table public.assistant_messages
      add constraint assistant_messages_role_check
      check (role in ('user', 'assistant'));
  end if;
end;
$$;

drop trigger if exists set_assistant_conversations_updated_at on public.assistant_conversations;
create trigger set_assistant_conversations_updated_at
before update on public.assistant_conversations
for each row execute function public.set_updated_at();

drop trigger if exists set_assistant_messages_updated_at on public.assistant_messages;
create trigger set_assistant_messages_updated_at
before update on public.assistant_messages
for each row execute function public.set_updated_at();

create index if not exists assistant_conversations_user_home_last_idx
  on public.assistant_conversations(user_id, home_id, last_message_at desc);
create index if not exists assistant_conversations_saved_idx
  on public.assistant_conversations(user_id, home_id, is_saved);
create index if not exists assistant_messages_conversation_order_idx
  on public.assistant_messages(conversation_id, message_order);
create index if not exists assistant_messages_user_home_idx
  on public.assistant_messages(user_id, home_id);

alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;

drop policy if exists "Users can manage their own assistant conversations" on public.assistant_conversations;
create policy "Users can manage their own assistant conversations"
on public.assistant_conversations
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can manage their own assistant messages" on public.assistant_messages;
create policy "Users can manage their own assistant messages"
on public.assistant_messages
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

comment on table public.assistant_conversations is
  'Stores Nestify assistant conversation history and saved chats for each home.';
comment on column public.assistant_conversations.is_saved is
  'Marks a conversation the user explicitly saved from the assistant UI.';
comment on table public.assistant_messages is
  'Stores user and assistant message contents for assistant conversation history.';

notify pgrst, 'reload schema';
