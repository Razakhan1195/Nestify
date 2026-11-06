-- Single request per screen, with current session/household checks and RLS.
-- No caller-supplied identity/home, no cross-request authorization cache.
create function public.rezlee_mobile_screen_bootstrap(p_screen text,p_effective boolean default true)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare context jsonb; uid uuid; hid uuid; owner_access boolean; snapshot jsonb;
 bill_rows jsonb; bill_count bigint; task_rows jsonb;
begin
 if p_screen not in ('bills','care') or p_screen is null then raise exception 'Invalid screen' using errcode='22023'; end if;
 context:=public.rezlee_mobile_read_bootstrap(false,p_effective);
 if context->>'access'<>'active' or context->'homeAccess'='null'::jsonb then
  return context||jsonb_build_object('screenSnapshot',null);
 end if;
 uid:=auth.uid();hid:=(context->'homeAccess'->'home'->>'id')::uuid;
 owner_access:=context->'homeAccess'->>'role'='owner';
 if p_screen='bills' then
  if not owner_access then return context||jsonb_build_object('screenSnapshot',null);end if;
  if p_effective then
   select count(*) into bill_count from public.rezlee_effective_bills where user_id=uid and home_id=hid;
   select coalesce(jsonb_agg(x.row),'[]'::jsonb) into bill_rows from (
    select jsonb_build_object('id',b.id,'provider_id',b.provider_id,'name',b.name,'amount',b.amount,'current_amount_due',b.current_amount_due,'amount_paid',b.amount_paid,'payment_date',b.payment_date,'currency',b.currency,'due_date',b.due_date,'issue_date',b.issue_date,'billing_period_start',b.billing_period_start,'billing_period_end',b.billing_period_end,'status',b.status,'payment_status',b.payment_status,'autopay_status',b.autopay_status,'autopay_scheduled_amount',b.autopay_scheduled_amount,'autopay_scheduled_date',b.autopay_scheduled_date,'autopay_payment_method',b.autopay_payment_method,'recurrence',b.recurrence,'frequency',b.frequency,'custom_provider_name',b.custom_provider_name,'account_number_masked',b.account_number_masked,'usage_amount',b.usage_amount,'usage_unit',b.usage_unit,'notes',b.notes,'source',b.source,'raw_data',b.raw_data,'line_items',b.line_items,'original_document_id',b.original_document_id,'original_storage_path',b.original_storage_path)||jsonb_build_object('providers',case when p.id is null then null else jsonb_build_object('display_name',p.display_name,'name',p.name,'provider_priority',p.provider_priority) end) row
    from public.rezlee_effective_bills b left join public.providers p on p.id=b.provider_id
    where b.user_id=uid and b.home_id=hid order by b.due_date asc nulls last limit 1000)x;
  else
   select count(*) into bill_count from public.bills where user_id=uid and home_id=hid;
   select coalesce(jsonb_agg(x.row),'[]'::jsonb) into bill_rows from (
    select jsonb_build_object('id',b.id,'provider_id',b.provider_id,'name',b.name,'amount',b.amount,'current_amount_due',b.current_amount_due,'amount_paid',b.amount_paid,'payment_date',b.payment_date,'currency',b.currency,'due_date',b.due_date,'issue_date',b.issue_date,'billing_period_start',b.billing_period_start,'billing_period_end',b.billing_period_end,'status',b.status,'payment_status',b.payment_status,'autopay_status',b.autopay_status,'autopay_scheduled_amount',b.autopay_scheduled_amount,'autopay_scheduled_date',b.autopay_scheduled_date,'autopay_payment_method',b.autopay_payment_method,'recurrence',b.recurrence,'frequency',b.frequency,'custom_provider_name',b.custom_provider_name,'account_number_masked',b.account_number_masked,'usage_amount',b.usage_amount,'usage_unit',b.usage_unit,'notes',b.notes,'source',b.source,'raw_data',b.raw_data,'line_items',b.line_items,'original_document_id',b.original_document_id,'original_storage_path',b.original_storage_path)||jsonb_build_object('providers',case when p.id is null then null else jsonb_build_object('display_name',p.display_name,'name',p.name,'provider_priority',p.provider_priority) end) row
    from public.bills b left join public.providers p on p.id=b.provider_id
    where b.user_id=uid and b.home_id=hid order by b.due_date asc nulls last limit 1000)x;
  end if;
  snapshot:=jsonb_build_object('kind','bills','bills',bill_rows,'billsCount',bill_count,
   'uploadCapability',public.rezlee_bill_upload_available(),
   'providerActivity',coalesce((select jsonb_agg(x) from (select id,name,display_name,connection_status,sync_status,sync_failure_reason,requires_user_action,user_action_message,updated_at,data_capabilities from public.providers where user_id=uid and home_id=hid and (requires_user_action or connection_status in ('syncing','connecting','sync_failed')) order by updated_at desc limit 1000)x),'[]'::jsonb),
   'actions',coalesce((select jsonb_agg(x.row) from (select jsonb_build_object('bill_id',a.bill_id,'target',a.target,'bills',case when b.id is null then null else jsonb_build_object('id',b.id,'name',b.name,'custom_provider_name',b.custom_provider_name,'account_number_masked',b.account_number_masked)end) row from public.bill_outcome_actions a left join public.bills b on b.id=a.bill_id where a.user_id=uid and a.home_id=hid order by a.updated_at desc limit 501)x),'[]'::jsonb),
   'reviews',coalesce((select jsonb_agg(x.row) from (select jsonb_build_object('bill_id',a.bill_id,'review',a.review,'bills',case when b.id is null then null else jsonb_build_object('id',b.id,'name',b.name,'amount',b.amount,'currency',b.currency,'billing_period_start',b.billing_period_start,'billing_period_end',b.billing_period_end,'source',b.source,'status',b.status,'raw_data',b.raw_data,'updated_at',b.updated_at,'original_document_id',b.original_document_id,'custom_provider_name',b.custom_provider_name,'account_number_masked',b.account_number_masked,'provider_id',b.provider_id,'usage_amount',b.usage_amount,'usage_unit',b.usage_unit) end) row from public.connected_bill_reviews a left join public.bills b on b.id=a.bill_id where a.user_id=uid and a.home_id=hid order by a.updated_at desc limit 501)x),'[]'::jsonb),
   'integrations',coalesce((select jsonb_agg(x) from (select provider_id,metadata,last_sync_at from public.provider_integrations where adapter='ezgb' and user_id=uid and home_id=hid and status='connected' limit 1000)x),'[]'::jsonb));
 else
  select coalesce(jsonb_agg(x),'[]'::jsonb) into task_rows from (
   select id,title,description,due_date,recurrence,status,category,priority,created_at,assigned_member_id,rotation_id,cleaning_routine_id,cleaning_task_key from public.maintenance_tasks where home_id=hid and (not owner_access or user_id=uid) order by due_date asc nulls last limit 1000)x;
  snapshot:=jsonb_build_object('kind','care','householdProbe','[]'::jsonb,'tasks',task_rows,
   'members',coalesce((select jsonb_agg(x) from (select id,display_name from public.household_members where home_id=hid and id in (select (t->>'assigned_member_id')::uuid from jsonb_array_elements(task_rows)t))x),'[]'::jsonb),
   'routines',coalesce((select jsonb_agg(x) from (select id,state,definition from public.cleaning_routines where home_id=hid and id in (select (t->>'cleaning_routine_id')::uuid from jsonb_array_elements(task_rows)t))x),'[]'::jsonb),
   'reminderAdoption',case when owner_access then coalesce((select jsonb_agg(x) from (select id from public.timeline_events where user_id=uid and home_id=hid and event_type='maintenance_added' limit 1)x),'[]'::jsonb)else '[]'::jsonb end,
   'cleaningAdoption',case when owner_access then coalesce((select jsonb_agg(x) from (select request_id from public.care_plan_receipts where user_id=uid and home_id=hid and payload @> '{"kind":"cleaning"}'::jsonb and result @> '{"ok":true}'::jsonb limit 1)x),'[]'::jsonb)else '[]'::jsonb end,
   'maintenanceAdoption',case when owner_access then coalesce((select jsonb_agg(x) from (select request_id from public.care_plan_receipts where user_id=uid and home_id=hid and payload @> '{"kind":"maintenance"}'::jsonb and result @> '{"ok":true}'::jsonb limit 1)x),'[]'::jsonb)else '[]'::jsonb end);
 end if;
 return context||jsonb_build_object('screenSnapshot',snapshot);
end $$;
revoke all on function public.rezlee_mobile_screen_bootstrap(text,boolean) from public,anon;
grant execute on function public.rezlee_mobile_screen_bootstrap(text,boolean) to authenticated;
notify pgrst,'reload schema';
