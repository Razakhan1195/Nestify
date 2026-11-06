-- Additive receipt deduplication. Existing general record-save function remains compatible.
create index if not exists vault_receipt_content_lookup on public.vault_save_receipts
(user_id,home_id,(payload->'file'->>'sha256'))
where payload->>'category'='Receipt' and nullif(payload->>'id','') is null;

create function public.prepare_rezlee_receipt_save(p_home uuid,p_request uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); prior public.vault_save_receipts%rowtype;
begin
 if caller is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text,742));
 if not public.rezlee_account_active(caller) or not exists(select 1 from public.homes where id=p_home and user_id=caller) then
  raise exception 'Home unavailable' using errcode='42501';
 end if;
 -- Existing request equality, edits and non-receipt saves keep the original contract.
 if exists(select 1 from public.vault_save_receipts where user_id=caller and request_id=p_request)
 or p_payload->>'category' is distinct from 'Receipt' or nullif(p_payload->>'id','') is not null
 or coalesce(p_payload->'file'->>'sha256','') !~ '^[a-f0-9]{64}$' then
  return public.prepare_rezlee_vault_save(p_home,p_request,p_payload);
 end if;
 select r.* into prior from public.vault_save_receipts r
 where r.user_id=caller and r.home_id=p_home and r.payload->>'category'='Receipt'
 and nullif(r.payload->>'id','') is null
 and r.payload->'file'->>'sha256'=p_payload->'file'->>'sha256'
 and r.payload->'file'->>'size'=p_payload->'file'->>'size'
 and r.payload->'file'->>'mime'=p_payload->'file'->>'mime'
 and ((r.status='prepared' and r.expires_at>now())
 or (r.status='committed' and exists(select 1 from public.documents d where d.id=r.document_id
 and d.user_id=caller and d.home_id=p_home and d.category='Receipt' and d.storage_path=r.file_path)))
 order by case when r.status='committed' then 0 else 1 end,r.created_at
 limit 1;
 if found then
  if prior.status='committed' then return jsonb_build_object('status','duplicate','id',prior.document_id); end if;
  return jsonb_build_object('status','duplicate_pending','requestId',prior.request_id);
 end if;
 return public.prepare_rezlee_vault_save(p_home,p_request,p_payload);
end $$;
revoke all on function public.prepare_rezlee_receipt_save(uuid,uuid,jsonb) from public,anon;
grant execute on function public.prepare_rezlee_receipt_save(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
