-- Recent Vault and activity reads filter an owner/home and then sort by creation.
-- Isolated 200k-row table experiments showed less work for these three queries.
-- Do not broaden to Bills/Care: their measured plan did not improve.
create index documents_owner_home_recent on public.documents(user_id,home_id,created_at desc);
create index inventory_items_owner_home_recent on public.inventory_items(user_id,home_id,created_at desc);
create index timeline_events_owner_home_recent on public.timeline_events(user_id,home_id,created_at desc);
