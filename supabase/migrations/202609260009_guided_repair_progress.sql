-- Additive: existing web repair fields, routes and private owner RLS remain intact.
alter table public.repair_issues
 add column if not exists guided_progress jsonb,
 add column if not exists guided_version integer not null default 0 check (guided_version >= 0);
create index if not exists repair_guided_private_recent
 on public.repair_issues(user_id,home_id,created_at desc,id desc)
 where guided_progress is not null;
