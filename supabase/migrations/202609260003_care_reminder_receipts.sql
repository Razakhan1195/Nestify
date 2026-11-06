-- Atomic single-reminder save, reusing the existing private care-save receipt table.
create function public.save_rezlee_care_reminder(target_home uuid,request_key text,task_values jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); payload jsonb; receipt public.care_plan_receipts%rowtype; task_id uuid; task_date date; cadence text; description_text text; result_json jsonb;
begin
 if caller is null or not exists(select 1 from public.homes where id=target_home and user_id=caller) then raise exception 'Only the household owner can save reminders' using errcode='42501'; end if;
 if request_key is null or request_key !~ '^[a-zA-Z0-9-]{8,96}$' then raise exception 'Invalid save identifier' using errcode='22023'; end if;
 if task_values is null or jsonb_typeof(task_values)<>'object' or jsonb_typeof(task_values->'title') is distinct from 'string' or char_length(trim(task_values->>'title')) not between 1 and 140
 or jsonb_typeof(task_values->'category') is distinct from 'string' or char_length(trim(task_values->>'category')) not between 1 and 80
 or char_length(coalesce(task_values->>'description',''))>1000 or char_length(coalesce(task_values->>'relevance',''))>200
 or coalesce(task_values->>'priority','normal') not in ('high','normal','low') then raise exception 'Check reminder details' using errcode='22023'; end if;
 cadence:=lower(coalesce(task_values->>'recurrence',''));
 if cadence not in ('','daily','weekly','biweekly','monthly','quarterly','biannual','semiannual','annual','annually','yearly') then raise exception 'Choose a supported repeat' using errcode='22023'; end if;
 if coalesce(task_values->>'due_date','')<>'' then
  if task_values->>'due_date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose a valid date' using errcode='22023';end if;
  task_date:=(task_values->>'due_date')::date;
 end if;
 payload:=jsonb_build_object('kind','reminder','home',target_home,'task',task_values);
 insert into public.care_plan_receipts(user_id,request_id,home_id,payload)values(caller,request_key,target_home,payload)on conflict(user_id,request_id)do nothing;
 select * into receipt from public.care_plan_receipts where user_id=caller and request_id=request_key for update;
 if receipt.payload<>payload then raise exception 'Save identifier already used for different choices' using errcode='22023';end if;
 if receipt.result is not null then
  if not exists(select 1 from public.maintenance_tasks where id=(receipt.result->>'id')::uuid and home_id=target_home and user_id=caller) then return jsonb_build_object('ok',false,'removed',true);end if;
  return receipt.result;
 end if;
 description_text:=nullif(concat_ws(E'\n',nullif(trim(task_values->>'description'),''),case when nullif(trim(task_values->>'relevance'),'') is not null then 'Applies to: '||trim(task_values->>'relevance') end),'');
 insert into public.maintenance_tasks(user_id,home_id,title,category,description,due_date,recurrence,priority,status)
 values(caller,target_home,trim(task_values->>'title'),trim(task_values->>'category'),description_text,task_date,nullif(case when cadence='semiannual' then 'biannual' else cadence end,''),coalesce(task_values->>'priority','normal'),'open') returning id into task_id;
 insert into public.timeline_events(user_id,home_id,event_type,title,body,related_table,related_id)
 values(caller,target_home,'maintenance_added','Reminder added',case when task_date is not null then 'Due '||task_date::text end,'maintenance_tasks',task_id);
 result_json:=jsonb_build_object('ok',true,'id',task_id);
 update public.care_plan_receipts set result=result_json where user_id=caller and request_id=request_key;
 return result_json;
end;
$$;
revoke all on function public.save_rezlee_care_reminder(uuid,text,jsonb) from public,anon;
grant execute on function public.save_rezlee_care_reminder(uuid,text,jsonb) to authenticated;

-- Preserve the existing member authorization and row-locking recurrence implementation.
-- Recognize the cadence written by the previous mobile Twice a year control too.
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
    when 'semiannual' then interval '6 months'
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
