-- Phase 5: Deck integration metadata and safe bill/document upserts.
-- Safe to run in Supabase SQL Editor.

alter table public.providers add column if not exists deck_connection_id text;
alter table public.providers add column if not exists deck_connection_status text;
alter table public.providers add column if not exists deck_connection_metadata jsonb not null default '{}'::jsonb;

alter table public.bills add column if not exists external_bill_id text;
alter table public.bills add column if not exists issue_date date;
alter table public.bills add column if not exists billing_period_start date;
alter table public.bills add column if not exists billing_period_end date;
alter table public.bills add column if not exists account_number_masked text;
alter table public.bills add column if not exists usage_amount numeric(12, 2);
alter table public.bills add column if not exists usage_unit text;
alter table public.bills add column if not exists previous_balance numeric(12, 2);
alter table public.bills add column if not exists pdf_available boolean not null default false;
alter table public.bills add column if not exists line_items jsonb not null default '[]'::jsonb;
alter table public.bills add column if not exists detected_fees jsonb not null default '[]'::jsonb;
alter table public.bills add column if not exists raw_data jsonb not null default '{}'::jsonb;

alter table public.documents add column if not exists external_document_id text;
alter table public.documents add column if not exists source text;

create unique index if not exists bills_provider_external_bill_id_uidx
on public.bills(provider_id, external_bill_id)
where external_bill_id is not null;

create unique index if not exists documents_provider_external_document_id_uidx
on public.documents(provider_id, external_document_id)
where external_document_id is not null;

create index if not exists providers_deck_connection_id_idx on public.providers(deck_connection_id);
create index if not exists bills_external_bill_id_idx on public.bills(external_bill_id);
create index if not exists documents_external_document_id_idx on public.documents(external_document_id);

comment on column public.providers.deck_connection_id is 'External Deck connection identifier. Never stores provider credentials.';
comment on column public.providers.deck_connection_status is 'Latest Deck connection status from the adapter.';
comment on column public.providers.deck_connection_metadata is 'Non-sensitive Deck connection metadata for debugging and UX.';
comment on column public.bills.external_bill_id is 'External bill identifier from Deck or another provider integration.';
comment on column public.documents.external_document_id is 'External document identifier from Deck or another provider integration.';

notify pgrst, 'reload schema';
