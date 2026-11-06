-- Enforce one live EZGB job per home; retain all historical jobs.
update public.integration_sync_jobs set status = 'waiting', finished_at = now()
where adapter = 'ezgb' and status in ('queued', 'running') and expires_at <= now();

with ranked as (
  select id, row_number() over (partition by user_id, home_id order by created_at desc) as position
  from public.integration_sync_jobs
  where adapter = 'ezgb' and status in ('queued', 'running')
)
update public.integration_sync_jobs j set status = 'waiting', finished_at = now()
from ranked r where j.id = r.id and r.position > 1;

create unique index if not exists integration_sync_jobs_one_live_ezgb_home
on public.integration_sync_jobs(user_id, home_id)
where adapter = 'ezgb' and status in ('queued', 'running');
