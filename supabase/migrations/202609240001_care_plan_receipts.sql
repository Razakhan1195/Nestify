-- One atomic save receipt per authenticated owner and client intent.
-- A response lost after commit can be replayed without creating tasks twice.
create table public.care_plan_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null check (char_length(request_id) between 8 and 96),
  home_id uuid not null references public.homes(id) on delete cascade,
  payload jsonb not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);
alter table public.care_plan_receipts enable row level security;
revoke all on public.care_plan_receipts from anon, authenticated;
create policy care_plan_receipts_owner_read on public.care_plan_receipts for select to authenticated
using (user_id = auth.uid());
grant select on public.care_plan_receipts to authenticated;

create function public.save_rezlee_care_plan(
  target_home uuid, request_key text, plan_tasks jsonb,
  assignment_mode text default 'none', member_ids uuid[] default '{}',
  plan_kind text default 'maintenance'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  request_payload jsonb;
  receipt public.care_plan_receipts%rowtype;
  task jsonb;
  rotation uuid;
  assigned uuid;
  task_date date;
  task_id uuid;
  task_ids uuid[] := '{}';
  member_count integer;
  task_index integer := 0;
  result_json jsonb;
begin
  if caller is null or not exists(select 1 from public.homes where id = target_home and user_id = caller) then
    raise exception 'Only the household owner can save a plan' using errcode = '42501';
  end if;
  if request_key is null or request_key !~ '^[a-zA-Z0-9-]{8,96}$' then raise exception 'Invalid save identifier'; end if;
  if plan_kind is null or plan_kind not in ('maintenance','cleaning') or assignment_mode is null or assignment_mode not in ('none','person','rotate') then raise exception 'Invalid plan options'; end if;
  if plan_tasks is null or jsonb_typeof(plan_tasks) <> 'array' then raise exception 'Choose valid tasks'; end if;
  if jsonb_array_length(plan_tasks) not between 1 and 12 then raise exception 'Choose between one and twelve tasks'; end if;
  member_count := coalesce(cardinality(member_ids),0);
  if member_count > 12 or member_count <> (select count(distinct x) from unnest(member_ids) x)
    or (assignment_mode = 'none' and member_count <> 0)
    or (assignment_mode = 'person' and member_count <> 1)
    or (assignment_mode = 'rotate' and member_count < 2) then raise exception 'Choose valid household people'; end if;

  request_payload := jsonb_build_object('home',target_home,'tasks',plan_tasks,'mode',assignment_mode,'members',coalesce(member_ids,'{}'),'kind',plan_kind);
  insert into public.care_plan_receipts(user_id,request_id,home_id,payload)
    values(caller,request_key,target_home,request_payload) on conflict (user_id,request_id) do nothing;
  -- The unique insert and row lock serialize concurrent copies of one request.
  select * into receipt from public.care_plan_receipts where user_id=caller and request_id=request_key for update;
  if receipt.payload <> request_payload then raise exception 'Save identifier already used for different choices' using errcode='22023'; end if;
  if receipt.result is not null then return receipt.result; end if;

  if member_count <> (select count(*) from public.household_members where id=any(member_ids) and home_id=target_home and status='active') then
    raise exception 'Choose active members of this household';
  end if;
  if assignment_mode='rotate' then
    insert into public.household_rotations(home_id,created_by_user_id,title) values(target_home,caller,'Cleaning routine') returning id into rotation;
    insert into public.household_rotation_members(rotation_id,member_id,position)
      select rotation,id,ordinality-1 from unnest(member_ids) with ordinality as members(id,ordinality);
  end if;
  for task in select value from jsonb_array_elements(plan_tasks) loop
    if jsonb_typeof(task) <> 'object' or jsonb_typeof(task->'title') is distinct from 'string'
      or char_length(trim(task->>'title')) not between 1 and 160
      or char_length(coalesce(task->>'category','')) > 80
      or char_length(coalesce(task->>'description','')) > 400
      or char_length(coalesce(task->>'recurrence','')) > 80
      or coalesce(task->>'priority','normal') not in ('high','normal','low') then raise exception 'Check the task details'; end if;
    task_date := null;
    if coalesce(task->>'due_date','') <> '' then
      if task->>'due_date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose a valid date'; end if;
      task_date := (task->>'due_date')::date;
    end if;
    assigned := case when assignment_mode='none' then null when assignment_mode='person' then member_ids[1] else member_ids[(task_index % member_count)+1] end;
    insert into public.maintenance_tasks(user_id,home_id,title,category,description,recurrence,priority,due_date,status,assigned_member_id,rotation_id)
      values(caller,target_home,trim(task->>'title'),nullif(trim(task->>'category'),''),nullif(trim(task->>'description'),''),nullif(trim(task->>'recurrence'),''),coalesce(task->>'priority','normal'),task_date,'open',assigned,rotation)
      returning id into task_id;
    task_ids := array_append(task_ids,task_id);
    task_index := task_index+1;
  end loop;
  insert into public.timeline_events(user_id,home_id,event_type,title,related_table)
    values(caller,target_home,'maintenance_plan_added','Added ' || task_index || ' care tasks','maintenance_tasks');
  result_json := jsonb_build_object('ok',true,'count',task_index,'taskIds',task_ids);
  update public.care_plan_receipts set result=result_json where user_id=caller and request_id=request_key;
  return result_json;
end;
$$;
revoke all on function public.save_rezlee_care_plan(uuid,text,jsonb,text,uuid[],text) from public,anon;
grant execute on function public.save_rezlee_care_plan(uuid,text,jsonb,text,uuid[],text) to authenticated;
notify pgrst, 'reload schema';
