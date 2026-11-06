-- Additive routine definitions; existing tasks and completed history are preserved.
create table public.cleaning_routines (
 id uuid primary key default gen_random_uuid(),
 home_id uuid not null references public.homes(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null,
 timezone text not null,
 state text not null default 'active' check(state in ('active','paused','ended')),
 definition jsonb not null,
 version integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.cleaning_routines enable row level security;
revoke all on public.cleaning_routines from anon,authenticated;
grant select on public.cleaning_routines to authenticated;
create policy cleaning_routines_read on public.cleaning_routines for select to authenticated
 using(user_id=auth.uid() or public.is_active_household_member(home_id));
alter table public.maintenance_tasks add column cleaning_routine_id uuid references public.cleaning_routines(id) on delete set null;
alter table public.maintenance_tasks add column cleaning_task_key text;
create unique index cleaning_one_open_occurrence on public.maintenance_tasks(cleaning_routine_id,cleaning_task_key)
 where cleaning_routine_id is not null and status<>'completed';

-- Date-only scheduling avoids UTC/DST drift. Monthly dates retain the anchor day.
create function public.rezlee_cleaning_next_date(spec jsonb,after_date date,inclusive boolean default false)
returns date language plpgsql immutable set search_path='' as $$
declare anchor date:=(spec->>'start')::date; unit text:=spec->>'unit'; frequency integer:=(spec->>'every')::integer;
 candidate date; base date; delta integer; anchor_week date; anchor_day integer;
begin
 if frequency not between 1 and 12 or unit not in ('day','week','month') then raise exception 'Invalid frequency' using errcode='22023';end if;
 candidate:=greatest(anchor,after_date+case when inclusive then 0 else 1 end);
 if unit='day' then
  delta:=(candidate-anchor)%frequency;
  return candidate+case when delta=0 then 0 else frequency-delta end;
 elsif unit='week' then
  anchor_week:=anchor-((extract(dow from anchor)::integer+6)%7);
  for delta in 0..90 loop
   if (((candidate-anchor_week)/7)%frequency)=0 and exists(select 1 from jsonb_array_elements_text(spec->'weekdays') d where d::integer=extract(dow from candidate)::integer) then return candidate;end if;
   candidate:=candidate+1;
  end loop;
 else
  anchor_day:=extract(day from anchor)::integer;
  base:=date_trunc('month',candidate)::date;
  for delta in 0..13 loop
   if ((extract(year from base)::integer-extract(year from anchor)::integer)*12+extract(month from base)::integer-extract(month from anchor)::integer)%frequency=0 then
    candidate:=base+least(anchor_day,extract(day from (base+interval '1 month'-interval '1 day'))::integer)-1;
    if candidate>=anchor and (candidate>after_date or inclusive and candidate=after_date) then return candidate;end if;
   end if;
   base:=(base+interval '1 month')::date;
  end loop;
 end if;
 raise exception 'No valid scheduled day' using errcode='22023';
end;
$$;

create function public.rezlee_cleaning_assignee(target_home uuid,spec jsonb,due date)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare ids uuid[]; step integer:=0; anchor date:=(spec->>'start')::date; mode text:=spec->>'rotation';
begin
 select array_agg(m.id order by choice.ordinality) into ids from jsonb_array_elements_text(spec->'members') with ordinality choice(id,ordinality)
 join public.household_members m on m.id=choice.id::uuid and m.home_id=target_home and m.status='active';
 if coalesce(cardinality(ids),0)=0 then return null;end if;
 if mode='weekly' then step:=greatest(0,((due-((extract(dow from due)::integer+6)%7))-(anchor-((extract(dow from anchor)::integer+6)%7)))/7);
 elsif mode='monthly' then step:=greatest(0,(extract(year from due)::integer-extract(year from anchor)::integer)*12+extract(month from due)::integer-extract(month from anchor)::integer);
 end if;
 return ids[(step%cardinality(ids))+1];
end;
$$;
revoke all on function public.rezlee_cleaning_assignee(uuid,jsonb,date) from public,anon,authenticated;

create function public.save_rezlee_cleaning_routine(target_home uuid,request_key text,routine_id uuid,expected_version integer,values_json jsonb,apply_current boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); receipt public.care_plan_receipts%rowtype; routine public.cleaning_routines%rowtype;
 payload jsonb; spec jsonb; keys text[]:='{}'; member uuid; due date; today date; result_json jsonb; task_count integer:=0; chosen uuid:=coalesce(routine_id,gen_random_uuid());
begin
 if caller is null or not exists(select 1 from public.homes where id=target_home and user_id=caller) then raise exception 'Only the owner can change routines' using errcode='42501';end if;
 if request_key is null or request_key !~ '^[a-zA-Z0-9-]{8,96}$' or values_json is null or jsonb_typeof(values_json)<>'object'
 or char_length(trim(coalesce(values_json->>'title',''))) not between 1 and 80 or values_json->>'state' not in ('active','paused','ended')
 or not exists(select 1 from pg_timezone_names where name=values_json->>'timezone') or jsonb_typeof(values_json->'tasks') is distinct from 'array'
 then raise exception 'Check routine details' using errcode='22023';end if;
 if jsonb_array_length(values_json->'tasks') not between 1 and 12 then raise exception 'Choose one to twelve tasks' using errcode='22023';end if;
 payload:=jsonb_build_object('kind','cleaning','home',target_home,'id',routine_id,'version',expected_version,'values',values_json,'current',apply_current);
 insert into public.care_plan_receipts(user_id,request_id,home_id,payload)values(caller,request_key,target_home,payload)on conflict(user_id,request_id)do nothing;
 select * into receipt from public.care_plan_receipts where user_id=caller and request_id=request_key for update;
 if receipt.payload<>payload then raise exception 'Save identifier changed' using errcode='22023';end if;
 if receipt.result is not null then return receipt.result;end if;
 if routine_id is not null and expected_version>0 then
  select * into routine from public.cleaning_routines where id=routine_id and home_id=target_home and user_id=caller for update;
  if not found or expected_version is distinct from routine.version then raise exception 'This routine changed. Reload before saving.' using errcode='PT409';end if;
 end if;
 today:=(now() at time zone (values_json->>'timezone'))::date;
 for spec in select value from jsonb_array_elements(values_json->'tasks') loop
  if coalesce(spec->>'key','') !~ '^[a-zA-Z0-9-]{8,96}$' or spec->>'key'=any(keys) or char_length(trim(coalesce(spec->>'title',''))) not between 1 and 140
   or char_length(trim(coalesce(spec->>'room',''))) not between 1 and 80 or coalesce(spec->>'start','') !~ '^\d{4}-\d{2}-\d{2}$'
   or spec->>'unit' not in ('day','week','month') or coalesce(spec->>'every','') !~ '^[0-9]+$' or (spec->>'every')::integer not between 1 and 12
   or spec->>'rotation' not in ('fixed','weekly','monthly') or jsonb_typeof(spec->'members') is distinct from 'array'
   or jsonb_typeof(spec->'weekdays') is distinct from 'array' then raise exception 'Check each task’s room, schedule and people' using errcode='22023';end if;
  keys:=array_append(keys,spec->>'key');
  if (spec->>'start')::date<'2020-01-01'::date or (spec->>'start')::date>'2100-01-01'::date then raise exception 'Choose a supported date' using errcode='22023';end if;
  if spec->>'unit'='week' and jsonb_array_length(spec->'weekdays') not between 1 and 7 then raise exception 'Choose a weekday' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements_text(spec->'weekdays') d where d !~ '^[0-6]$') then raise exception 'Invalid weekday' using errcode='22023';end if;
  if jsonb_array_length(spec->'members')>12 or (spec->>'rotation'='fixed' and jsonb_array_length(spec->'members')>1)
   or (spec->>'rotation'<>'fixed' and jsonb_array_length(spec->'members')<2)
   or jsonb_array_length(spec->'members')<>(select count(distinct m) from jsonb_array_elements_text(spec->'members') m) then raise exception 'Choose valid household people' using errcode='22023';end if;
  for member in select value::uuid from jsonb_array_elements_text(spec->'members') loop
   if not exists(select 1 from public.household_members where id=member and home_id=target_home and status='active') then raise exception 'Choose active household members' using errcode='22023';end if;
  end loop;
  perform public.rezlee_cleaning_next_date(spec,today,true);
 end loop;
 if routine_id is null or expected_version=0 then
  insert into public.cleaning_routines(id,home_id,user_id,title,timezone,state,definition) values(chosen,target_home,caller,trim(values_json->>'title'),values_json->>'timezone',values_json->>'state',values_json->'tasks') returning * into routine;
 else
  update public.cleaning_routines set title=trim(values_json->>'title'),timezone=values_json->>'timezone',state=values_json->>'state',definition=values_json->'tasks',version=version+1,updated_at=now() where id=chosen returning * into routine;
 end if;
 -- Removing a definition stops future repeats; existing open and completed tasks stay.
 if routine.state='active' or apply_current then
  for spec in select value from jsonb_array_elements(routine.definition) loop
   due:=public.rezlee_cleaning_next_date(spec,today,true);
   if apply_current then
    update public.maintenance_tasks set title=trim(spec->>'title'),category=trim(spec->>'room'),due_date=due,assigned_member_id=public.rezlee_cleaning_assignee(target_home,spec,due),recurrence='custom'
    where cleaning_routine_id=chosen and cleaning_task_key=spec->>'key' and status<>'completed';
   end if;
   insert into public.maintenance_tasks(user_id,home_id,title,category,recurrence,priority,due_date,status,assigned_member_id,cleaning_routine_id,cleaning_task_key)
   select caller,target_home,trim(spec->>'title'),trim(spec->>'room'),'custom','normal',due,'open',public.rezlee_cleaning_assignee(target_home,spec,due),chosen,spec->>'key'
   where routine.state='active' and not exists(select 1 from public.maintenance_tasks where cleaning_routine_id=chosen and cleaning_task_key=spec->>'key' and status<>'completed');
   task_count:=task_count+1;
  end loop;
 end if;
 result_json:=jsonb_build_object('ok',true,'id',chosen,'version',routine.version,'count',task_count);
 update public.care_plan_receipts set result=result_json where user_id=caller and request_id=request_key;
 return result_json;
end;
$$;
revoke all on function public.save_rezlee_cleaning_routine(uuid,text,uuid,integer,jsonb,boolean) from public,anon;
grant execute on function public.save_rezlee_cleaning_routine(uuid,text,uuid,integer,jsonb,boolean) to authenticated;

-- Preserve legacy task semantics and route managed routines through anchored schedules.
alter function public.complete_rezlee_task(uuid) rename to complete_rezlee_legacy_task;
revoke all on function public.complete_rezlee_legacy_task(uuid) from public,anon,authenticated;
create function public.complete_rezlee_task(task_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare task public.maintenance_tasks%rowtype; routine public.cleaning_routines%rowtype; spec jsonb; due date; next_id uuid; today date;
begin
 select * into task from public.maintenance_tasks where id=task_id;
 if task.cleaning_routine_id is null then return public.complete_rezlee_legacy_task(task_id);end if;
 select * into routine from public.cleaning_routines where id=task.cleaning_routine_id for update;
 select * into task from public.maintenance_tasks where id=task_id for update;
 if not exists(select 1 from public.homes where id=task.home_id and user_id=auth.uid()) and not exists(select 1 from public.household_members where home_id=task.home_id and linked_user_id=auth.uid() and status='active' and (task.assigned_member_id is null or id=task.assigned_member_id)) then raise exception 'Task access required' using errcode='42501';end if;
 if task.status='completed' then return jsonb_build_object('completed',false);end if;
 update public.maintenance_tasks set status='completed',completed_at=now() where id=task.id;
 select value into spec from jsonb_array_elements(routine.definition) where value->>'key'=task.cleaning_task_key;
 if routine.state='active' and spec is not null then
  today:=(now() at time zone routine.timezone)::date;
  due:=public.rezlee_cleaning_next_date(spec,greatest(coalesce(task.due_date,today),today),false);
  insert into public.maintenance_tasks(user_id,home_id,title,category,recurrence,priority,due_date,status,assigned_member_id,cleaning_routine_id,cleaning_task_key)
  values(task.user_id,task.home_id,trim(spec->>'title'),trim(spec->>'room'),'custom','normal',due,'open',public.rezlee_cleaning_assignee(task.home_id,spec,due),routine.id,task.cleaning_task_key) returning id into next_id;
 end if;
 return jsonb_build_object('completed',true,'next_date',due,'next_task_id',next_id);
end;
$$;
revoke all on function public.complete_rezlee_task(uuid) from public,anon;
grant execute on function public.complete_rezlee_task(uuid) to authenticated;
-- Correct one open occurrence without rewriting completed history.
create function public.edit_rezlee_care_task(task_id uuid,expected_json jsonb,values_json jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare task public.maintenance_tasks%rowtype; snapshot jsonb; date_value date;
begin
 select t.* into task from public.maintenance_tasks t join public.homes h on h.id=t.home_id where t.id=task_id and h.user_id=auth.uid() for update of t;
 if not found then raise exception 'Task access required' using errcode='42501';end if;
 if task.status='completed' then raise exception 'Completed history cannot be edited' using errcode='PT409';end if;
 if char_length(trim(coalesce(values_json->>'title',''))) not between 1 and 140 or char_length(trim(coalesce(values_json->>'category',''))) not between 1 and 80
 or coalesce(values_json->>'recurrence','') not in ('','daily','weekly','biweekly','monthly','quarterly','biannual','semiannual','annual','annually','yearly','custom') then raise exception 'Check task details' using errcode='22023';end if;
 if task.cleaning_routine_id is not null and values_json->>'recurrence' is distinct from 'custom' then raise exception 'Change the repeat in its routine' using errcode='22023';end if;
 if task.cleaning_routine_id is null and values_json->>'recurrence'='custom' then raise exception 'Choose a supported repeat' using errcode='22023';end if;
 if nullif(values_json->>'due_date','') is not null then date_value:=(values_json->>'due_date')::date;end if;
 snapshot:=jsonb_build_object('title',task.title,'category',coalesce(task.category,''),'due_date',coalesce(task.due_date::text,''),'recurrence',coalesce(task.recurrence,''));
 if snapshot=values_json then return jsonb_build_object('ok',true);end if;
 if snapshot<>expected_json then raise exception 'This task changed. Reload before editing.' using errcode='PT409';end if;
 update public.maintenance_tasks set title=trim(values_json->>'title'),category=trim(values_json->>'category'),due_date=date_value,recurrence=nullif(values_json->>'recurrence','') where id=task.id;
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.edit_rezlee_care_task(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.edit_rezlee_care_task(uuid,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
