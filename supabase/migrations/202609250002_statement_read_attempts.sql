-- Private durable extraction results. Authenticated clients may read their own
-- results but cannot enqueue, forge completion or alter extracted suggestions.
create table public.statement_read_attempts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 home_id uuid not null references public.homes(id) on delete cascade,
 bill_id uuid not null references public.bills(id) on delete cascade,
 document_id uuid not null references public.documents(id) on delete cascade,
 source_basis text not null check(length(source_basis)=64),
 status text not null default 'queued' check(status in ('queued','running','complete','failed')),
 result jsonb,
 created_at timestamptz not null default now(),
 finished_at timestamptz,
 unique(bill_id,document_id),
 check(result is null or (jsonb_typeof(result)='object' and octet_length(result::text)<=20000))
);
create index statement_read_owner_idx on public.statement_read_attempts(user_id,home_id,bill_id);
alter table public.statement_read_attempts enable row level security;
create policy statement_read_own on public.statement_read_attempts for select to authenticated
 using(user_id=auth.uid() and public.rezlee_account_active(auth.uid()) and exists(
  select 1 from public.homes h where h.id=home_id and h.user_id=auth.uid()
 ));
revoke all on public.statement_read_attempts from public,anon,authenticated;
grant select on public.statement_read_attempts to authenticated;
grant all on public.statement_read_attempts to service_role;
create trigger statement_read_account_guard before insert or update on public.statement_read_attempts
 for each row execute function public.guard_deleting_rezlee_account();
notify pgrst,'reload schema';
