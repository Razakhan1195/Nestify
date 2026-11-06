-- Welcome acknowledgement belongs to the account, independently of the founder note.
alter table public.rezlee_member_accounts add column pro_welcome_seen_at timestamptz;

-- Explicitly designated QA accounts may verify store sandbox receipts. No public writes.
-- This does not grant Pro, bypass receipt verification, or affect normal customers.
create table public.rezlee_membership_test_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 allow_store_sandbox boolean not null default false,
 reason text not null check(length(trim(reason)) >= 12),
 created_at timestamptz not null default now()
);
alter table public.rezlee_membership_test_accounts enable row level security;
revoke all on public.rezlee_membership_test_accounts from public, anon, authenticated;
grant select, insert, update, delete on public.rezlee_membership_test_accounts to service_role;
create trigger guard_deleting_account before insert or update on public.rezlee_membership_test_accounts
for each row execute function public.guard_deleting_rezlee_account();
notify pgrst, 'reload schema';
