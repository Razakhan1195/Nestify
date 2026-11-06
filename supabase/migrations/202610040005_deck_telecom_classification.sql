-- Extend the existing payment vocabulary to the partial state used by the app.
alter table public.bills drop constraint if exists bills_payment_status_check;
alter table public.bills add constraint bills_payment_status_check check (payment_status in ('unpaid','scheduled','paid','overdue','partial'));
-- Additive correction: payment evidence and history remain distinct.
create or replace function public.save_rezlee_telecom_bill(p_job uuid,p_lease uuid,p_run text,p_bill jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare j public.deck_telecom_imports%rowtype;p public.providers%rowtype;b public.bills%rowtype;v uuid;
begin
 select * into j from public.deck_telecom_imports where id=p_job;
 if not found or j.lease_token is distinct from p_lease or j.lease_until<=now() or j.status not in ('running','verification') or j.task_run_id<>p_run then raise exception 'Import changed' using errcode='42501';end if;
 select * into p from public.providers where id=j.provider_id for update;
 if not found or p.user_id<>j.user_id or p.home_id<>j.home_id or p.deck_credential_id is distinct from j.credential_id or p.connection_status='disconnected' then raise exception 'Connection changed' using errcode='42501';end if;
 if p_bill->>'external_bill_id' not like 'deck-telco-%' or p_bill->>'user_id'<>j.user_id::text or p_bill->>'provider_id'<>p.id::text then raise exception 'Invalid bill' using errcode='22023';end if;
 -- Newest statements replace the payment view for the same full account only.
 -- Older records stay available as history, including their payment evidence.
 if p_bill->'raw_data'->>'import_phase'='latest' and p_bill->'raw_data'->>'account_key' ~ '^[a-f0-9]{64}$' then
  update public.bills set status='archived',current_amount_due=null,
   raw_data=jsonb_set(raw_data,'{record_kind}','"historical"'::jsonb)
  where user_id=j.user_id and provider_id=p.id and source='deck'
   and raw_data->>'account_key'=p_bill->'raw_data'->>'account_key'
   and issue_date<(p_bill->>'issue_date')::date;
 end if;
 select * into b from public.bills where user_id=j.user_id and provider_id=p.id and external_bill_id=p_bill->>'external_bill_id' for update;
 v:=coalesce(b.id,gen_random_uuid());
 if b.id is null then
  insert into public.bills(id,user_id,home_id,provider_id,provider_connection_id,external_bill_id,name,amount,currency,due_date,issue_date,billing_period_start,billing_period_end,account_number_masked,current_amount_due,amount_paid,payment_date,payment_status,status,source,raw_data,line_items,detected_fees,pdf_available,autopay_status,autopay_scheduled_amount,autopay_scheduled_date)
  values(v,j.user_id,j.home_id,p.id,p.id,p_bill->>'external_bill_id',p_bill->>'name',(p_bill->>'amount')::numeric,p_bill->>'currency',nullif(p_bill->>'due_date','')::date,(p_bill->>'issue_date')::date,nullif(p_bill->>'billing_period_start','')::date,nullif(p_bill->>'billing_period_end','')::date,p_bill->>'account_number_masked',(p_bill->>'current_amount_due')::numeric,(p_bill->>'amount_paid')::numeric,nullif(p_bill->>'payment_date','')::date,p_bill->>'payment_status',p_bill->>'status','deck',p_bill->'raw_data',p_bill->'line_items',p_bill->'detected_fees',false,p_bill->>'autopay_status',(p_bill->>'autopay_scheduled_amount')::numeric,nullif(p_bill->>'autopay_scheduled_date','')::date);
 else
  -- A history window revisiting the newest statement must not erase its
  -- current payment snapshot. Latest pulls can refresh provider evidence;
  -- explicit user-recorded payments and originals remain intact.
  update public.bills set amount=(p_bill->>'amount')::numeric,
   billing_period_start=coalesce(nullif(p_bill->>'billing_period_start','')::date,b.billing_period_start),
   billing_period_end=coalesce(nullif(p_bill->>'billing_period_end','')::date,b.billing_period_end),
   account_number_masked=coalesce(p_bill->>'account_number_masked',b.account_number_masked),
   due_date=coalesce(nullif(p_bill->>'due_date','')::date,b.due_date),
   current_amount_due=case when p_bill->'raw_data'->>'import_phase'='latest' then (p_bill->>'current_amount_due')::numeric else b.current_amount_due end,
   status=case when b.paid_at is not null then b.status when p_bill->'raw_data'->>'import_phase'='latest' then p_bill->>'status' else b.status end,
   payment_status=case when b.paid_at is not null then b.payment_status when p_bill->'raw_data'->>'import_phase'='latest' then p_bill->>'payment_status' else b.payment_status end,
   amount_paid=case when b.paid_at is not null then b.amount_paid when p_bill->'raw_data'->>'import_phase'='latest' then (p_bill->>'amount_paid')::numeric else b.amount_paid end,
   payment_date=case when b.paid_at is not null then b.payment_date when p_bill->'raw_data'->>'import_phase'='latest' then nullif(p_bill->>'payment_date','')::date else b.payment_date end,
   autopay_status=case when p_bill->'raw_data'->>'import_phase'='latest' then p_bill->>'autopay_status' else b.autopay_status end,
   autopay_scheduled_amount=case when p_bill->'raw_data'->>'import_phase'='latest' then (p_bill->>'autopay_scheduled_amount')::numeric else b.autopay_scheduled_amount end,
   autopay_scheduled_date=case when p_bill->'raw_data'->>'import_phase'='latest' then nullif(p_bill->>'autopay_scheduled_date','')::date else b.autopay_scheduled_date end,
   raw_data=case when p_bill->'raw_data'->>'import_phase'='history' then
     (b.raw_data || (p_bill->'raw_data')) || jsonb_build_object('record_kind',coalesce(b.raw_data->>'record_kind','historical'))
    else b.raw_data || (p_bill->'raw_data') end,
   line_items=p_bill->'line_items',detected_fees=p_bill->'detected_fees'
  where id=b.id;
 end if;
 insert into public.deck_telecom_snapshots(user_id,provider_id,bill_id,task_run_id,payload) values(j.user_id,p.id,v,p_run,p_bill) on conflict(bill_id,task_run_id) do nothing;
 return v;
end $$;
revoke all on function public.save_rezlee_telecom_bill(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_rezlee_telecom_bill(uuid,uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
