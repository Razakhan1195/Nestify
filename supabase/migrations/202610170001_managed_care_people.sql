-- Parent-managed task profiles have no login, invitation or private-record access.
-- Existing local household members are reused; historical migrations remain untouched.
create or replace function public.rezlee_add_managed_care_person(target_home uuid,person_id uuid,person_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare member public.household_members%rowtype;
begin
 if auth.uid() is null or not exists(select 1 from public.homes where id=target_home and user_id=auth.uid()) then raise exception 'Owner required' using errcode='42501'; end if;
 perform 1 from public.homes where id=target_home for update;
 if person_id is null or char_length(trim(coalesce(person_name,''))) not between 1 and 80 then raise exception 'Name required' using errcode='22023';end if;
 select * into member from public.household_members where id=person_id;
 if found then
  if member.home_id=target_home and member.status='local' and member.linked_user_id is null and member.display_name=trim(person_name) then return to_jsonb(member);end if;
  raise exception 'This person changed' using errcode='PT409';
 end if;
 if exists(select 1 from public.household_members where home_id=target_home and lower(trim(display_name))=lower(trim(person_name))) then raise exception 'Name already exists' using errcode='PT409';end if;
 insert into public.household_members(id,home_id,created_by_user_id,display_name,role,status,relationship)
 values(person_id,target_home,auth.uid(),trim(person_name),'member','local','Family') returning * into member;
 return to_jsonb(member);
end;
$$;
revoke all on function public.rezlee_add_managed_care_person(uuid,uuid,text) from public,anon;
grant execute on function public.rezlee_add_managed_care_person(uuid,uuid,text) to authenticated;

create or replace function public.rezlee_cleaning_assignee(target_home uuid,spec jsonb,due date)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare ids uuid[]; step integer:=0; anchor date:=(spec->>'start')::date; mode text:=spec->>'rotation';
begin
 select array_agg(m.id order by choice.ordinality) into ids from jsonb_array_elements_text(spec->'members') with ordinality choice(id,ordinality)
 join public.household_members m on m.id=choice.id::uuid and m.home_id=target_home and (m.status='active' or (m.status='local' and m.linked_user_id is null));
 if coalesce(cardinality(ids),0)=0 then return null;end if;
 if mode='weekly' then step:=greatest(0,((due-((extract(dow from due)::integer+6)%7))-(anchor-((extract(dow from anchor)::integer+6)%7)))/7);
 elsif mode='monthly' then step:=greatest(0,(extract(year from due)::integer-extract(year from anchor)::integer)*12+extract(month from due)::integer-extract(month from anchor)::integer);
 end if;
 return ids[(step%cardinality(ids))+1];
end;
$$;
revoke all on function public.rezlee_cleaning_assignee(uuid,jsonb,date) from public,anon,authenticated;

create or replace function public.save_rezlee_cleaning_routine(target_home uuid,request_key text,routine_id uuid,expected_version integer,values_json jsonb,apply_current boolean default false)
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
   if not exists(select 1 from public.household_members where id=member and home_id=target_home and (status='active' or (status='local' and linked_user_id is null))) then raise exception 'Choose available household people' using errcode='22023';end if;
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

