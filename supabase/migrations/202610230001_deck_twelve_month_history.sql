-- Preserve existing choices; allow the new explicitly selected twelve-month range.
alter table public.deck_hosted_auth_intents drop constraint if exists deck_hosted_auth_intents_history_months_check;
alter table public.deck_hosted_auth_intents add constraint deck_hosted_auth_intents_history_months_check check (history_months between 1 and 12);
alter table public.deck_hosted_auth_intents alter column history_months set default 12;
