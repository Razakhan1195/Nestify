-- Consolidate Home's ten HTTP reads into one RLS-enforced database request.
-- SECURITY INVOKER preserves all table, account-freeze and session policies.
create function public.rezlee_home_snapshot(p_home uuid,p_effective boolean default true)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare uid uuid:=auth.uid();owner_access boolean; result jsonb:='{}'; missing text[]:='{}'; rows jsonb;
begin
 if uid is null then raise sqlstate 'PT401' using message='Sign in required';end if;
 select user_id=uid into owner_access from public.homes where id=p_home;
 if owner_access is null then raise sqlstate 'PT404' using message='Home unavailable';end if;
 begin
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into rows from (select id,name,display_name,provider_priority,connection_status,health_status,last_successful_sync_at,next_expected_bill_date,requires_user_action,user_action_message,data_capabilities from public.providers where user_id=uid and home_id=p_home order by provider_priority asc nulls last)q;
  result:=result||jsonb_build_object('providers',rows);
 exception when others then
  missing:=array_append(missing,'providers');result:=result||jsonb_build_object('providers','[]'::jsonb);
 end;
 begin
  if p_effective then
   select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into rows from (select b.id,b.provider_id,b.name,b.amount,b.currency,b.due_date,b.status,b.paid_at,b.payment_status,b.source,b.raw_data,b.created_at,(select jsonb_build_object('display_name',p.display_name,'name',p.name,'provider_priority',p.provider_priority) from public.providers p where p.id=b.provider_id) as providers from public.rezlee_effective_bills b where b.user_id=uid and b.home_id=p_home order by b.due_date asc nulls last)q;
  else
   select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into rows from (select b.id,b.provider_id,b.name,b.amount,b.currency,b.due_date,b.status,b.paid_at,b.payment_status,b.source,b.raw_data,b.created_at,(select jsonb_build_object('display_name',p.display_name,'name',p.name,'provider_priority',p.provider_priority) from public.providers p where p.id=b.provider_id) as providers from public.bills b where b.user_id=uid and b.home_id=p_home order by b.due_date asc nulls last)q;
  end if;
  result:=result||jsonb_build_object('bills',rows);
 exception when others then
  missing:=array_append(missing,'bills');result:=result||jsonb_build_object('bills','[]'::jsonb);
 end;
 begin
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into rows from (select id,title,description,due_date,status,category,recurrence from public.maintenance_tasks where home_id=p_home and (not owner_access or user_id=uid) and status<>'completed' order by due_date asc nulls last)q;
  result:=result||jsonb_build_object('care',rows);
 exception when others then
  missing:=array_append(missing,'care');result:=result||jsonb_build_object('care','[]'::jsonb);
 end;
 begin
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into rows from (select id,title,document_type,expires_on,created_at from public.documents where user_id=uid and home_id=p_home order by created_at desc)q;
  result:=result||jsonb_build_object('records',rows);
 exception when others then
  missing:=array_append(missing,'records');result:=result||jsonb_build_object('records','[]'::jsonb);
 end;
 begin
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into rows from (select attention_key,resolution_status,snoozed_until from public.attention_resolutions where user_id=uid and home_id=p_home)q;
  result:=result||jsonb_build_object('resolutions',rows);
 exception when others then
  missing:=array_append(missing,'resolutions');result:=result||jsonb_build_object('resolutions','[]'::jsonb);
 end;
 begin
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into rows from (select id,bill_id,provider_id,event_key,event_type,severity,title,description,metadata,resolution_status,snoozed_until,created_at from public.bill_events where user_id=uid and home_id=p_home order by created_at desc limit 50)q;
  result:=result||jsonb_build_object('billEvents',rows);
 exception when others then
  missing:=array_append(missing,'billEvents');result:=result||jsonb_build_object('billEvents','[]'::jsonb);
 end;
 begin
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into rows from (select id,created_at from public.inventory_items where user_id=uid and home_id=p_home)q;
  result:=result||jsonb_build_object('items',rows);
 exception when others then
  missing:=array_append(missing,'items');result:=result||jsonb_build_object('items','[]'::jsonb);
 end;
 begin
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into rows from (select id,title,description,category,location,urgency,status,related_task_id,created_at from public.repair_issues where user_id=uid and home_id=p_home and status in ('open','next_steps_ready','waiting_on_landlord','waiting_on_professional') order by created_at desc)q;
  result:=result||jsonb_build_object('issues',rows);
 exception when others then
  missing:=array_append(missing,'issues');result:=result||jsonb_build_object('issues','[]'::jsonb);
 end;
 begin
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into rows from (select id,title,body,event_type,occurred_on,related_table,related_id,created_at from public.timeline_events where user_id=uid and home_id=p_home order by created_at desc limit 12)q;
  result:=result||jsonb_build_object('activity',rows);
 exception when others then
  missing:=array_append(missing,'activity');result:=result||jsonb_build_object('activity','[]'::jsonb);
 end;
 begin
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into rows from (select id,display_name,relationship,role,status,created_at from public.household_members where home_id=p_home order by role asc,created_at asc)q;
  result:=result||jsonb_build_object('household',rows);
 exception when others then
  missing:=array_append(missing,'household');result:=result||jsonb_build_object('household','[]'::jsonb);
 end;
 return result||jsonb_build_object('missing',to_jsonb(missing));
end $$;
revoke all on function public.rezlee_home_snapshot(uuid,boolean) from public,anon;
grant execute on function public.rezlee_home_snapshot(uuid,boolean) to authenticated;
notify pgrst,'reload schema';
