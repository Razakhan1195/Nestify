-- Household collaboration foundation.
-- Starts with task collaboration only; bills/documents remain owner-private.

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  linked_user_id uuid references auth.users(id) on delete set null,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  email text,
  relationship text,
  role text not null default 'member' check (role in ('owner', 'member')),
  status text not null default 'local' check (status in ('local', 'invited', 'active')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists household_members_linked_user_idx
  on public.household_members(home_id, linked_user_id)
  where linked_user_id is not null;
create index if not exists household_members_home_idx
  on public.household_members(home_id, role, display_name);

create table if not exists public.household_rotations (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  enabled boolean not null default true,  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_rotation_members (
  rotation_id uuid not null references public.household_rotations(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  position integer not null check (position >= 0),
  primary key (rotation_id, member_id),
  unique (rotation_id, position)
);

alter table public.maintenance_tasks
  add column if not exists assigned_member_id uuid references public.household_members(id) on delete set null;
alter table public.maintenance_tasks
  add column if not exists rotation_id uuid references public.household_rotations(id) on delete set null;

create index if not exists maintenance_tasks_assignee_idx
  on public.maintenance_tasks(home_id, assigned_member_id, status, due_date);
create index if not exists maintenance_tasks_rotation_idx
  on public.maintenance_tasks(rotation_id)
  where rotation_id is not null;

insert into public.household_members (
  home_id, created_by_user_id, linked_user_id, display_name, email, relationship, role, status
)
select
  h.id,
  h.user_id,  h.user_id,
  coalesce(nullif(p.full_name, ''), nullif(split_part(p.email, '@', 1), ''), 'You'),
  p.email,
  'You',
  'owner',
  'active'
from public.homes h
left join public.profiles p on p.user_id = h.user_id
where not exists (
  select 1 from public.household_members hm
  where hm.home_id = h.id and hm.role = 'owner'
);

alter table public.household_members enable row level security;
alter table public.household_rotations enable row level security;
alter table public.household_rotation_members enable row level security;

create policy household_members_owner_manage
on public.household_members for all to authenticated
using (
  exists (
    select 1 from public.homes h
    where h.id = household_members.home_id and h.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.homes h
    where h.id = household_members.home_id and h.user_id = auth.uid()
  )
);

create policy household_members_linked_read
on public.household_members for select to authenticated
using (linked_user_id = auth.uid());
create policy household_rotations_owner_manage
on public.household_rotations for all to authenticated
using (
  exists (
    select 1 from public.homes h
    where h.id = household_rotations.home_id and h.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.homes h
    where h.id = household_rotations.home_id and h.user_id = auth.uid()
  )
);

create policy household_rotation_members_owner_manage
on public.household_rotation_members for all to authenticated
using (
  exists (
    select 1
    from public.household_rotations r
    join public.homes h on h.id = r.home_id
    where r.id = household_rotation_members.rotation_id
      and h.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.household_rotations r
    join public.homes h on h.id = r.home_id
    where r.id = household_rotation_members.rotation_id
      and h.user_id = auth.uid()
  )
);
create or replace function public.complete_rezlee_task(task_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  task public.maintenance_tasks%rowtype;
  next_date date;
  next_id uuid;
  cadence interval;
  current_position integer;
  next_assignee uuid;
begin
  select t.* into task
  from public.maintenance_tasks t
  join public.homes h on h.id = t.home_id
  where t.id = task_id
    and t.user_id = auth.uid()
    and h.user_id = auth.uid()
  for update of t;

  if not found then raise exception 'Task not found'; end if;
  if task.status = 'completed' then
    return jsonb_build_object('completed', false);
  end if;

  cadence := case lower(coalesce(task.recurrence, ''))
    when 'daily' then interval '1 day'
    when 'weekly' then interval '7 days'
    when 'biweekly' then interval '14 days'
    when 'monthly' then interval '1 month'
    when 'quarterly' then interval '3 months'    when 'biannual' then interval '6 months'
    when 'annual' then interval '1 year'
    when 'annually' then interval '1 year'
    when 'yearly' then interval '1 year'
    else null
  end;

  update public.maintenance_tasks
  set status = 'completed', completed_at = now()
  where id = task.id and user_id = auth.uid();

  next_assignee := task.assigned_member_id;
  if task.rotation_id is not null then
    select rm.position into current_position
    from public.household_rotation_members rm
    where rm.rotation_id = task.rotation_id
      and rm.member_id = task.assigned_member_id;

    select rm.member_id into next_assignee
    from public.household_rotation_members rm
    join public.household_members hm on hm.id = rm.member_id
    where rm.rotation_id = task.rotation_id
      and hm.home_id = task.home_id
      and hm.status in ('local', 'active')
      and rm.position > coalesce(current_position, -1)
    order by rm.position
    limit 1;
  end if;
  if task.rotation_id is not null and next_assignee is null then
    select rm.member_id into next_assignee
    from public.household_rotation_members rm
    join public.household_members hm on hm.id = rm.member_id
    where rm.rotation_id = task.rotation_id
      and hm.home_id = task.home_id
      and hm.status in ('local', 'active')
    order by rm.position
    limit 1;
  end if;

  if cadence is not null then
    next_date := (
      greatest(coalesce(task.due_date, current_date), current_date) + cadence
    )::date;

    insert into public.maintenance_tasks (
      user_id, home_id, provider_id, title, description, category,
      recurrence, priority, due_date, status, assigned_member_id, rotation_id
    )
    values (
      task.user_id, task.home_id, task.provider_id, task.title,
      task.description, task.category, task.recurrence, task.priority,
      next_date, 'open', next_assignee, task.rotation_id
    )
    returning id into next_id;
  end if;

  return jsonb_build_object(
    'completed', true,
    'next_date', next_date,
    'next_task_id', next_id,
    'next_assigned_member_id', next_assignee
  );
end;
$$;
revoke all on function public.complete_rezlee_task(uuid) from public, anon;
grant execute on function public.complete_rezlee_task(uuid) to authenticated;

create or replace function public.validate_household_task_links() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.assigned_member_id is not null and not exists (
    select 1 from public.household_members hm
    where hm.id = new.assigned_member_id and hm.home_id = new.home_id
  ) then
    raise exception 'Assigned household member must belong to this home';
  end if;

  if new.rotation_id is not null and not exists (
    select 1 from public.household_rotations r
    where r.id = new.rotation_id and r.home_id = new.home_id
  ) then
    raise exception 'Rotation must belong to this home';
  end if;

  return new;
end;
$$;

drop trigger if exists maintenance_tasks_household_links on public.maintenance_tasks;
create trigger maintenance_tasks_household_links
before insert or update of home_id, assigned_member_id, rotation_id
on public.maintenance_tasks
for each row execute function public.validate_household_task_links();

notify pgrst, 'reload schema';