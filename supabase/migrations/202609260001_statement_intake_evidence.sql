-- Additive: old clients omit supporting_details and retain the existing save contract.
create function public.rezlee_upload_reviewed_evidence(p jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare e jsonb:=p->'supporting_details'; f jsonb; q jsonb; k text; v text;
 keys text[]:=array['previousBalance','amountDue','subtotal','tax','credits','usage','unit','reading','ratePlan','discountEnds'];
begin
 if e is null then return '{}'::jsonb; end if;
 f:=e->'fields'; q:=e->'quotes';
 if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(f) is distinct from 'object' or jsonb_typeof(q) is distinct from 'object'
 then raise exception 'Invalid supporting details' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(e) x where x not in ('fields','quotes'))
 or exists(select 1 from jsonb_object_keys(f) x where not(x=any(keys)))
 then raise exception 'Unknown supporting details' using errcode='22023'; end if;
 foreach k in array keys loop
  if jsonb_typeof(f->k) is distinct from 'string' or length(f->>k)>120 then raise exception 'Invalid supporting value' using errcode='22023'; end if;
 end loop;
 for k,v in select * from jsonb_each_text(q) loop
  if not(k=any(keys)) or jsonb_typeof(q->k) is distinct from 'string' or length(btrim(v))=0 or length(v)>160 or length(f->>k)=0
  then raise exception 'Invalid supporting quote' using errcode='22023'; end if;
 end loop;
 foreach k in array array['previousBalance','amountDue','subtotal','tax','credits'] loop
  v:=f->>k;
  if v<>'' and v !~ '^-?[0-9]{1,10}(\.[0-9]{1,2})?$' then raise exception 'Invalid money value' using errcode='22023'; end if;
 end loop;
 if nullif(f->>'credits','')::numeric<0 then raise exception 'Invalid credit' using errcode='22023'; end if;
 if f->>'usage'<>'' and f->>'usage' !~ '^[0-9]{1,10}(\.[0-9]{1,6})?$' then raise exception 'Invalid usage' using errcode='22023'; end if;
 if (f->>'unit') not in ('','kWh','m³','GJ','L','Other') or ((f->>'usage'='')<>(f->>'unit'=''))
 or (f->>'reading') not in ('','actual','estimated','mixed','unknown') then raise exception 'Invalid usage details' using errcode='22023'; end if;
 v:=f->>'discountEnds';
 if v<>'' and (v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (v::date)::text<>v) then raise exception 'Invalid discount date' using errcode='22023'; end if;
 return jsonb_build_object('statement_evidence',f,'statement_evidence_quotes',q,'statement_evidence_source','upload_review',
  'statement_evidence_reviewed_at',now(),'statement_evidence_basis',jsonb_build_object('amount',(p->>'amount')::numeric,
  'start',p->>'billing_period_start','end',p->>'billing_period_end','provider',p->>'provider_name','account',p->>'account_number','category',p->>'category'));
end $$;
revoke all on function public.rezlee_upload_reviewed_evidence(jsonb) from public,anon,authenticated;

create or replace function public.commit_rezlee_bill_upload(p_request uuid) returns jsonb
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
    null,'archived','manual',nullif(p->>'notes',''),jsonb_build_object('category',p->>'category','record_kind','historical','amount_basis','period_charges','reviewed_upload',true)||public.rezlee_upload_reviewed_evidence(p),r.document_id,r.file_path);
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

create function public.rezlee_statement_intake_evidence_available() returns boolean language sql stable security invoker set search_path='' as $$select auth.uid() is not null$$;
revoke all on function public.rezlee_statement_intake_evidence_available() from public,anon;
grant execute on function public.rezlee_statement_intake_evidence_available() to authenticated;
notify pgrst,'reload schema';
