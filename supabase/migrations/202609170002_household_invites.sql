-- Household invitations and shared-member access.
-- Members share Household + Care only; Bills/Vault remain owner-private.

alter table public.household_members
  add column if not exists invite_sent_at timestamptz,
  add column if not exists accepted_at timestamptz;

create unique index if not exists household_members_home_email_uidx
  on public.household_members(home_id, lower(email))
  where email is not null;

create or replace function public.is_active_household_member(target_home_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.home_id = target_home_id
      and hm.linked_user_id = auth.uid()
      and hm.status = 'active'
  );
$$;
revoke all on function public.is_active_household_member(uuid) from public, anon;
grant execute on function public.is_active_household_member(uuid) to authenticated;

create policy household_members_active_household_read
on public.household_members for select to authenticated
using (public.is_active_household_member(home_id));

create policy household_rotations_active_household_read
on public.household_rotations for select to authenticated
using (public.is_active_household_member(home_id));

create policy household_rotation_members_active_household_read
on public.household_rotation_members for select to authenticated
using (
  exists (
    select 1 from public.household_rotations r
    where r.id = household_rotation_members.rotation_id
      and public.is_active_household_member(r.home_id)
  )
);

create policy homes_active_household_read
on public.homes for select to authenticated
using (public.is_active_household_member(id));

create policy maintenance_tasks_active_household_read
on public.maintenance_tasks for select to authenticated
using (public.is_active_household_member(home_id));

create or replace function public.accept_household_invite(member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  member public.household_members%rowtype;
  current_email text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  current_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if current_email = '' then raise exception 'Verified email required'; end if;

  select hm.* into member
  from public.household_members hm
  where hm.id = member_id
    and hm.status = 'invited'
    and lower(coalesce(hm.email, '')) = current_email
    and (hm.linked_user_id is null or hm.linked_user_id = auth.uid())
  for update;

  if not found then raise exception 'Invitation not found or does not match this account'; end if;

  update public.household_members
  set linked_user_id = auth.uid(), status = 'active', accepted_at = now(), updated_at = now()
  where id = member.id;

  return jsonb_build_object('accepted', true, 'home_id', member.home_id, 'member_id', member.id);
end;
$$;
revoke all on function public.accept_household_invite(uuid) from public, anon;
grant execute on function public.accept_household_invite(uuid) to authenticated;

create or replace function public.complete_rezlee_task(task_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
    and (
      h.user_id = auth.uid()
      or exists (
        select 1 from public.household_members hm
        where hm.home_id = t.home_id
          and hm.linked_user_id = auth.uid()
          and hm.status = 'active'
          and (t.assigned_member_id is null or t.assigned_member_id = hm.id)
      )
    )
  for update of t;

  if not found then raise exception 'Task not found'; end if;
  if task.status = 'completed' then return jsonb_build_object('completed', false); end if;

  cadence := case lower(coalesce(task.recurrence, ''))
    when 'daily' then interval '1 day'
    when 'weekly' then interval '7 days'
    when 'biweekly' then interval '14 days'
    when 'monthly' then interval '1 month'
    when 'quarterly' then interval '3 months'
    when 'biannual' then interval '6 months'
    when 'annual' then interval '1 year'
    when 'annually' then interval '1 year'
    when 'yearly' then interval '1 year'
    else null
  end;

  update public.maintenance_tasks set status = 'completed', completed_at = now() where id = task.id;

  next_assignee := task.assigned_member_id;
  if task.rotation_id is not null then
    select rm.position into current_position
    from public.household_rotation_members rm
    where rm.rotation_id = task.rotation_id and rm.member_id = task.assigned_member_id;

    select rm.member_id into next_assignee
    from public.household_rotation_members rm
    join public.household_members hm on hm.id = rm.member_id
    where rm.rotation_id = task.rotation_id
      and hm.home_id = task.home_id
      and hm.status in ('invited', 'active')
      and rm.position > coalesce(current_position, -1)
    order by rm.position limit 1;
  end if;

  if task.rotation_id is not null and next_assignee is null then
    select rm.member_id into next_assignee
    from public.household_rotation_members rm
    join public.household_members hm on hm.id = rm.member_id
    where rm.rotation_id = task.rotation_id
      and hm.home_id = task.home_id
      and hm.status in ('invited', 'active')
    order by rm.position limit 1;
  end if;

  if cadence is not null then
    next_date := (greatest(coalesce(task.due_date, current_date), current_date) + cadence)::date;
    insert into public.maintenance_tasks (
      user_id, home_id, provider_id, title, description, category,
      recurrence, priority, due_date, status, assigned_member_id, rotation_id
    ) values (
      task.user_id, task.home_id, task.provider_id, task.title, task.description,
      task.category, task.recurrence, task.priority, next_date, 'open', next_assignee, task.rotation_id
    ) returning id into next_id;
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

notify pgrst, 'reload schema';
