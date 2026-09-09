-- Atomic completion preserves the completed task and schedules the next known recurrence.
create function public.complete_rezlee_task(task_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare task public.maintenance_tasks%rowtype; next_date date; next_id uuid; cadence interval;
begin
  select t.* into task from public.maintenance_tasks t join public.homes h on h.id = t.home_id
    where t.id = task_id and t.user_id = auth.uid() and h.user_id = auth.uid() for update of t;
  if not found then raise exception 'Task not found'; end if;
  if task.status = 'completed' then return jsonb_build_object('completed', false); end if;
  cadence := case lower(coalesce(task.recurrence, ''))
    when 'daily' then interval '1 day' when 'weekly' then interval '7 days'
    when 'biweekly' then interval '14 days' when 'monthly' then interval '1 month'
    when 'quarterly' then interval '3 months' when 'biannual' then interval '6 months'
    when 'annual' then interval '1 year' when 'annually' then interval '1 year'
    when 'yearly' then interval '1 year' else null end;
  update public.maintenance_tasks set status = 'completed', completed_at = now() where id = task.id and user_id = auth.uid();
  if cadence is not null then
    next_date := (greatest(coalesce(task.due_date, current_date), current_date) + cadence)::date;
    insert into public.maintenance_tasks (user_id, home_id, provider_id, title, description, category, recurrence, priority, due_date, status)
    values (task.user_id, task.home_id, task.provider_id, task.title, task.description, task.category, task.recurrence, task.priority, next_date, 'open') returning id into next_id;
  end if;
  return jsonb_build_object('completed', true, 'next_date', next_date, 'next_task_id', next_id);
end;
$$;
revoke all on function public.complete_rezlee_task(uuid) from public, anon;
grant execute on function public.complete_rezlee_task(uuid) to authenticated;
notify pgrst, 'reload schema';
