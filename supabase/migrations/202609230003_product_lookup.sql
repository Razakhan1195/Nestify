alter table public.inventory_items add column product_barcode text;
alter table public.inventory_items add constraint inventory_barcode_format check(product_barcode is null or product_barcode ~ '^([0-9]{12}|[0-9]{13})$');
create table public.product_lookup_requests (
 day date not null,
 slot integer not null check(slot>=0 and slot<80),
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(day,slot)
);
alter table public.product_lookup_requests enable row level security;
create index product_lookup_user_day on public.product_lookup_requests(user_id,day);
create table public.product_lookup_cache (
 barcode text primary key,
 payload jsonb not null,
 expires_at timestamptz not null
);
alter table public.product_lookup_cache enable row level security;
