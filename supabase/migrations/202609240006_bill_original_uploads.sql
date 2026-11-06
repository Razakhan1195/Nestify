-- Reuse the existing immutable upload receipts and cleanup worker. No paid jobs.
alter table public.bills add column original_document_id uuid references public.documents(id) on delete set null;
alter table public.bills add column original_storage_path text;
alter table public.vault_save_receipts add column bill_id uuid;
alter table public.vault_save_receipts add column bill_payload jsonb;
alter table public.vault_save_receipts add column bill_base_version timestamptz;
alter table public.vault_save_receipts add column bill_committed_at timestamptz;
create index bill_original_document_idx on public.bills(original_document_id) where original_document_id is not null;
create index bill_upload_file_digest_idx on public.vault_save_receipts(user_id,home_id,((payload->'file')->>'sha256')) where bill_payload is not null;

create function public.guard_bill_original_owner() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.original_document_id is not null and not exists(
  select 1 from public.documents where id=new.original_document_id and user_id=new.user_id and home_id=new.home_id
 ) then raise exception 'Original unavailable' using errcode='42501'; end if;
 return new;
end $$;
create trigger guard_bill_original_owner before insert or update of original_document_id,user_id,home_id on public.bills
 for each row execute function public.guard_bill_original_owner();
revoke all on function public.guard_bill_original_owner() from public,anon,authenticated;

-- Validate again in SQL because authenticated clients can invoke public RPCs.
create function public.validate_bill_upload(p_bill jsonb) returns void
language plpgsql set search_path='' as $$
declare k text; v text;
begin
 if jsonb_typeof(p_bill) is distinct from 'object' then raise exception 'Invalid statement' using errcode='22023'; end if;
 foreach k in array array['bill_title','category','provider_name','account_number','amount','billing_period_start','billing_period_end'] loop
  if jsonb_typeof(p_bill->k) is distinct from 'string' or length(btrim(p_bill->>k))=0 then raise exception 'Missing statement details' using errcode='22023'; end if;
 end loop;
 if length(p_bill->>'bill_title')>140 or length(p_bill->>'category')>80 or length(p_bill->>'provider_name')>120
 or length(p_bill->>'account_number')>80 or length(coalesce(p_bill->>'notes',''))>5000
 or (p_bill->>'amount') !~ '^-?[0-9]{1,10}(\.[0-9]{1,2})?$' then raise exception 'Invalid statement details' using errcode='22023'; end if;
 foreach k in array array['billing_period_start','billing_period_end','issue_date','due_date'] loop
  v:=p_bill->>k;
  if coalesce(v,'')<>'' and (v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (v::date)::text<>v) then raise exception 'Invalid dates' using errcode='22023'; end if;
 end loop;
 if (p_bill->>'billing_period_end')::date < (p_bill->>'billing_period_start')::date or (p_bill->>'billing_period_end')::date > current_date
 then raise exception 'Invalid period' using errcode='22023'; end if;
end $$;
revoke all on function public.validate_bill_upload(jsonb) from public,anon,authenticated;

create function public.prepare_rezlee_bill_upload(p_home uuid,p_request uuid,p_bill jsonb,p_file jsonb,p_existing uuid default null,p_version timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); r public.vault_save_receipts%rowtype; b public.bills%rowtype; payload jsonb; v jsonb;
begin
 if caller is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text,742));
 if not public.rezlee_account_active(caller) or not exists(select 1 from public.homes where id=p_home and user_id=caller)
 then raise exception 'Home unavailable' using errcode='42501'; end if;
 perform public.validate_bill_upload(p_bill);
 if p_file is null or p_file='null'::jsonb then raise exception 'Original required' using errcode='22023'; end if;
 payload:=jsonb_build_object('title',p_bill->>'bill_title','category','Other','issued_on',coalesce(p_bill->>'issue_date',''),'expires_on','','notes','Original statement saved with bill history.','file',p_file,'bill',p_bill,'existing',p_existing,'version',p_version);
 select * into r from public.vault_save_receipts where user_id=caller and request_id=p_request for update;
 if found then
  if r.home_id<>p_home or r.payload<>payload or r.bill_payload is null then raise exception 'Save choices changed' using errcode='22023'; end if;
  if r.bill_committed_at is not null then
   return jsonb_build_object('status',case when exists(select 1 from public.bills where id=r.bill_id and user_id=caller) then 'committed' else 'deleted' end,'billId',r.bill_id);
  end if;
  v:=public.prepare_rezlee_vault_save(p_home,p_request,payload);
  return v||jsonb_build_object('billId',r.bill_id,'status',case when v->>'status'='committed' then 'prepared' else v->>'status' end);
 end if;
 -- Exact file already imported: do not charge storage again or duplicate it under a different nickname.
 select b2.* into b from public.vault_save_receipts s join public.bills b2 on b2.id=s.bill_id
 where s.user_id=caller and s.home_id=p_home and s.bill_committed_at is not null
 and s.payload->'file'->>'sha256'=p_file->>'sha256' and b2.user_id=caller limit 1;
 if found then return jsonb_build_object('status','duplicate','billId',b.id,'canAttach',false); end if;
 select * into b from public.bills where user_id=caller and home_id=p_home and source='manual'
 and raw_data->>'record_kind'='historical' and currency='CAD'
 and lower(btrim(custom_provider_name))=lower(btrim(p_bill->>'provider_name'))
 and lower(btrim(account_number_masked))=lower(btrim(p_bill->>'account_number'))
 and lower(btrim(raw_data->>'category'))=lower(btrim(p_bill->>'category'))
 and billing_period_start=(p_bill->>'billing_period_start')::date and billing_period_end=(p_bill->>'billing_period_end')::date for update;
 if found then
  if p_existing is null then
   return jsonb_build_object('status','duplicate','billId',b.id,'version',b.updated_at,'canAttach',b.original_document_id is null and b.amount=(p_bill->>'amount')::numeric);
  end if;
  if b.id<>p_existing or p_version is distinct from b.updated_at or b.original_document_id is not null or b.amount<>(p_bill->>'amount')::numeric
  then return jsonb_build_object('status','conflict'); end if;
 elsif p_existing is not null then return jsonb_build_object('status','conflict');
 end if;
 v:=public.prepare_rezlee_vault_save(p_home,p_request,payload);
 update public.vault_save_receipts set bill_id=coalesce(b.id,gen_random_uuid()),bill_payload=p_bill,bill_base_version=b.updated_at
 where user_id=caller and request_id=p_request returning * into r;
 return v||jsonb_build_object('billId',r.bill_id);
end $$;

create function public.commit_rezlee_bill_upload(p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); r public.vault_save_receipts%rowtype; b public.bills%rowtype; v jsonb; p jsonb;
begin
 if caller is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text,742));
 if not public.rezlee_account_active(caller) then raise exception 'Account unavailable' using errcode='42501'; end if;
 select * into r from public.vault_save_receipts where user_id=caller and request_id=p_request for update;
 if not found or r.bill_payload is null then raise exception 'Save unavailable' using errcode='P0002'; end if;
 if not exists(select 1 from public.homes where id=r.home_id and user_id=caller) then raise exception 'Home unavailable' using errcode='42501'; end if;
 if r.bill_committed_at is not null then
  return jsonb_build_object('status',case when exists(select 1 from public.bills where id=r.bill_id and user_id=caller) then 'committed' else 'deleted' end,'billId',r.bill_id);
 end if;
 if r.status not in ('prepared','committed') then return jsonb_build_object('status',r.status); end if;
 if r.status='prepared' and r.expires_at<=now() then
  update public.vault_save_receipts set status='abandoned',cleanup_path=file_path where user_id=caller and request_id=p_request;
  return jsonb_build_object('status','abandoned');
 end if;
 p:=r.bill_payload;
 if r.bill_base_version is not null then
  select * into b from public.bills where id=r.bill_id and user_id=caller and home_id=r.home_id for update;
  if not found or b.updated_at is distinct from r.bill_base_version or b.original_document_id is not null then
   update public.vault_save_receipts set status='conflict',cleanup_path=case when status='prepared' then file_path else null end where user_id=caller and request_id=p_request;
   return jsonb_build_object('status','conflict');
  end if;
 end if;
 -- Serialize same-byte imports, even with different claimed periods.
 if exists(select 1 from public.vault_save_receipts s join public.bills x on x.id=s.bill_id
  where s.user_id=caller and s.home_id=r.home_id and s.request_id<>p_request and s.bill_committed_at is not null
  and s.payload->'file'->>'sha256'=r.payload->'file'->>'sha256') then
  update public.vault_save_receipts set status='conflict',cleanup_path=case when status='prepared' then file_path else null end where user_id=caller and request_id=p_request;
  return jsonb_build_object('status','conflict');
 end if;
 begin
  -- This call, bill insertion/link and completion receipt share one transaction.
  v:=public.commit_rezlee_vault_save(p_request);
  if v->>'status'<>'committed' then return v; end if;
  if r.bill_base_version is null then
   insert into public.bills(id,user_id,home_id,name,custom_provider_name,account_number_masked,currency,amount,due_date,issue_date,billing_period_start,billing_period_end,payment_status,status,source,notes,raw_data,original_document_id,original_storage_path)
   values(r.bill_id,caller,r.home_id,p->>'bill_title',p->>'provider_name',p->>'account_number','CAD',(p->>'amount')::numeric,
    nullif(p->>'due_date','')::date,nullif(p->>'issue_date','')::date,(p->>'billing_period_start')::date,(p->>'billing_period_end')::date,
    null,'archived','manual',nullif(p->>'notes',''),jsonb_build_object('category',p->>'category','record_kind','historical','amount_basis','period_charges','reviewed_upload',true),r.document_id,r.file_path);
  else
   update public.bills set original_document_id=r.document_id,original_storage_path=r.file_path where id=r.bill_id and user_id=caller and home_id=r.home_id;
  end if;
  update public.documents set document_type='Statement' where id=r.document_id and user_id=caller;
  update public.vault_save_receipts set bill_committed_at=now() where user_id=caller and request_id=p_request;
 exception when unique_violation then
  -- Roll back the new document as well; stage cleanup of the uploaded object.
  update public.vault_save_receipts set status='conflict',cleanup_path=case when status='prepared' then file_path else null end where user_id=caller and request_id=p_request;
  return jsonb_build_object('status','conflict');
 end;
 return jsonb_build_object('status','committed','billId',r.bill_id);
end $$;

create function public.rezlee_bill_upload_available() returns boolean language sql stable security invoker set search_path=public
as $$ select auth.uid() is not null $$;
revoke all on function public.prepare_rezlee_bill_upload(uuid,uuid,jsonb,jsonb,uuid,timestamptz),public.commit_rezlee_bill_upload(uuid),public.rezlee_bill_upload_available() from public,anon;
grant execute on function public.prepare_rezlee_bill_upload(uuid,uuid,jsonb,jsonb,uuid,timestamptz),public.commit_rezlee_bill_upload(uuid),public.rezlee_bill_upload_available() to authenticated;

-- Allow only the FK's nested nulling of a deleted document reference during
-- account deletion. Keep the existing write freeze for all other bill changes.
create or replace function public.guard_deleting_rezlee_account() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid; record_json jsonb := to_jsonb(new);
begin
 if tg_op='UPDATE' and tg_table_name='bills' and pg_trigger_depth()>1
 and to_jsonb(old)->>'original_document_id' is not null and record_json->>'original_document_id' is null
 and (record_json-'original_document_id'-'updated_at')=(to_jsonb(old)-'original_document_id'-'updated_at') then return new; end if;
 if tg_op='UPDATE' and pg_trigger_depth()>1 and
  (to_jsonb(new)-'assigned_member_id'-'rotation_id'-'linked_user_id'-'updated_at') =
  (to_jsonb(old)-'assigned_member_id'-'rotation_id'-'linked_user_id'-'updated_at') then return new; end if;
 target := coalesce((record_json->>'user_id')::uuid,(record_json->>'created_by_user_id')::uuid);
 if target is not null then
  perform pg_advisory_xact_lock(hashtextextended(target::text,742));
  if not public.rezlee_account_active(target) then raise exception 'Account is being deleted' using errcode='42501'; end if;
 end if;
 return new;
end $$;

notify pgrst,'reload schema';
