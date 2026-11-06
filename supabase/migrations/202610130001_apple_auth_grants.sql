-- Apply before deploying the Apple grant endpoint or deletion worker.
-- Service-only ciphertext; no mobile client can read/write even its own grant.
create table public.apple_auth_grants (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 client_id text not null check(length(client_id) between 3 and 255),
 apple_subject text not null check(length(apple_subject) between 1 and 255),
 token_hash text not null check(token_hash ~ '^[a-f0-9]{64}$'),
 token_cipher text not null check(length(token_cipher) between 32 and 8192),
 created_at timestamptz not null default now(),
 unique(user_id,client_id,token_hash)
);
alter table public.apple_auth_grants enable row level security;
revoke all on public.apple_auth_grants from public, anon, authenticated;
grant select,insert,update,delete on public.apple_auth_grants to service_role;
create trigger guard_deleting_account before insert or update on public.apple_auth_grants
 for each row execute function public.guard_deleting_rezlee_account();
notify pgrst,'reload schema';
