-- Non-secret import preference, fixed when a hosted intent is created.
alter table public.deck_hosted_auth_intents add column if not exists history_months integer not null default 6 check (history_months between 1 and 6);
