-- Preserve originals and reuse exact receipts across Gmail and uploads.
create or replace function public.accept_rezlee_email_capture(p_id uuid,p_home uuid,p_record jsonb,p_bill jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); r public.email_capture_jobs%rowtype; result jsonb; doc uuid; bill uuid; existing public.bills%rowtype;
 payload jsonb:=jsonb_build_object('record',p_record,'bill',p_bill);
begin
 if u is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,742));
 if not public.rezlee_account_active(u) or not exists(select 1 from public.homes where id=p_home and user_id=u)
 then raise exception 'Home unavailable' using errcode='42501'; end if;
 select * into r from public.email_capture_jobs where id=p_id and user_id=u and home_id=p_home for update;
 if not found then raise exception 'Import unavailable' using errcode='P0002'; end if;
 if r.status='discarded' and r.document_id is not null then
  return jsonb_build_object('status',case when exists(select 1 from public.documents where id=r.document_id and user_id=u) then 'removed' else 'deleted' end);
 end if;
 if r.status='saved' then
  if r.accepted_payload<>payload then raise exception 'Save choices changed' using errcode='22023'; end if;
  if not exists(select 1 from public.documents where id=r.document_id and user_id=u and home_id=p_home)
   or (r.bill_id is not null and not exists(select 1 from public.bills where id=r.bill_id and user_id=u and home_id=p_home))
  then return jsonb_build_object('status','deleted'); end if;
  return jsonb_build_object('status','saved','documentId',r.document_id,'billId',r.bill_id);
 end if;
 if r.status<>'ready' then raise exception 'Review required' using errcode='22023'; end if;
 if p_record ? 'id' or p_record ? 'file' or p_record ? 'expected_version' then raise exception 'New record required' using errcode='22023'; end if;
 -- Only an uncommitted Gmail receipt may receive corrected review fields.
 -- The original fingerprint/path stays immutable; committed records cannot change.
 if r.source_type='gmail' and jsonb_typeof(r.source_meta->'file')='object' then
  update public.vault_save_receipts as receipt set payload=p_record||jsonb_build_object('file',r.source_meta->'file','expected_version',null)
  where user_id=u and home_id=p_home and request_id=p_id and status='prepared' and receipt.payload->'file'=r.source_meta->'file';
 end if;
 if p_record->>'category'='Receipt' then
  result:=public.prepare_rezlee_receipt_save(p_home,p_id,p_record||jsonb_build_object('file',case when r.source_type='gmail' then r.source_meta->'file' else null end,'expected_version',null));
 else
  result:=public.prepare_rezlee_vault_save(p_home,p_id,p_record||jsonb_build_object('file',case when r.source_type='gmail' then r.source_meta->'file' else null end,'expected_version',null));
 end if;
 if result->>'status'='duplicate' then
  -- Exact, owned, persisted receipt: link this email to the original. Never copy it.
  doc:=(result->>'id')::uuid;
 else
  if result->>'status' not in ('prepared','committed') then raise exception 'Record save unavailable' using errcode='55000'; end if;
  result:=public.commit_rezlee_vault_save(p_id);
  if result->>'status'<>'committed' then raise exception 'Record save unavailable' using errcode='55000'; end if;
  doc:=(result->>'id')::uuid;
 end if;
 if p_bill is not null and p_bill<>'null'::jsonb then
  if jsonb_typeof(p_bill)<>'object' or p_bill->>'user_id'<>u::text or p_bill->>'home_id'<>p_home::text
   or coalesce(p_bill->>'currency','')<>'CAD' or coalesce(p_bill->'raw_data'->>'record_kind','')<>'historical'
   or coalesce(p_bill->'raw_data'->>'save_signature','') !~ '^[a-f0-9]{64}$'
   or coalesce(p_bill->>'amount','') !~ '^-?[0-9]{1,10}(\.[0-9]{1,2})?$'
   or coalesce(length(trim(p_bill->>'custom_provider_name')),0) not between 1 and 120
   or coalesce(length(trim(p_bill->>'account_number_masked')),0) not between 1 and 80
   or coalesce(length(trim(p_bill->>'name')),0) not between 1 and 140
   or coalesce(length(trim(p_bill->'raw_data'->>'category')),0) not between 1 and 80
   or coalesce(p_bill->>'billing_period_start','') !~ '^\d{4}-\d{2}-\d{2}$'
   or coalesce(p_bill->>'billing_period_end','') !~ '^\d{4}-\d{2}-\d{2}$'
  then raise exception 'Check statement details' using errcode='22023'; end if;
  select * into existing from public.bills where user_id=u and home_id=p_home and source='manual'
    and raw_data->>'record_kind'='historical'
    and lower(trim(custom_provider_name))=lower(trim(p_bill->>'custom_provider_name'))
    and lower(trim(account_number_masked))=lower(trim(p_bill->>'account_number_masked'))
    and lower(trim(raw_data->>'category'))=lower(trim(p_bill->'raw_data'->>'category'))
    and currency='CAD' and billing_period_start=(p_bill->>'billing_period_start')::date and billing_period_end=(p_bill->>'billing_period_end')::date;
  if found then
   if existing.raw_data->>'save_signature' is distinct from p_bill->'raw_data'->>'save_signature' then
    raise exception 'This statement period already exists; review it in Bills' using errcode='23505';
   end if;
   bill:=existing.id;
  else
   insert into public.bills(user_id,home_id,name,custom_provider_name,account_number_masked,currency,amount,billing_period_start,billing_period_end,
    due_date,issue_date,status,source,payment_status,current_amount_due,amount_paid,reminder_date,notes,raw_data,original_document_id,original_storage_path)
   values(u,p_home,p_bill->>'name',p_bill->>'custom_provider_name',p_bill->>'account_number_masked','CAD',(p_bill->>'amount')::numeric,
    (p_bill->>'billing_period_start')::date,(p_bill->>'billing_period_end')::date,nullif(p_bill->>'due_date','')::date,nullif(p_bill->>'issue_date','')::date,
    'archived','manual',null,null,null,null,p_bill->>'notes',p_bill->'raw_data',case when r.source_meta->'file' is not null and r.source_meta->'file'<>'null'::jsonb then doc else null end,(select storage_path from public.documents where id=doc)) returning id into bill;
  end if;
 end if;
 update public.email_capture_jobs set status='saved',accepted_payload=payload,proposal=null,document_id=doc,bill_id=bill,updated_at=now() where id=p_id;
 return jsonb_build_object('status','saved','documentId',doc,'billId',bill);
end $$;


-- Read-only exact-original lookup before AI. No fuzzy financial matching, cross-home
-- reuse, raw email retention or trust in a caller-supplied user identity.
create function public.rezlee_gmail_saved_original(p_link uuid,p_hash text,p_size bigint)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.gmail_memory_links l
  join public.vault_save_receipts r on r.user_id=l.user_id and r.home_id=l.home_id
  join public.documents d on d.id=r.document_id and d.user_id=l.user_id and d.home_id=l.home_id and d.storage_path=r.file_path
  where l.id=p_link and l.status='active' and public.rezlee_account_active(l.user_id)
   and r.status='committed' and p_hash ~ '^[a-f0-9]{64}$'
   and r.payload->'file'->>'sha256'=p_hash and r.payload->'file'->>'size'=p_size::text
 );
$$;
revoke all on function public.rezlee_gmail_saved_original(uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.rezlee_gmail_saved_original(uuid,text,bigint) to service_role;
notify pgrst,'reload schema';
