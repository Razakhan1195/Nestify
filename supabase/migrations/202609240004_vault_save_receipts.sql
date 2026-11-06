-- Apply before releasing the mobile record-save API. No provider retrievals.
create table public.vault_save_receipts (
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 home_id uuid not null references public.homes(id) on delete cascade,
 document_id uuid not null, -- preserve receipt after document deletion; never recreate on replay
 payload jsonb not null,
 base_version timestamptz,
 status text not null default 'prepared' check(status in ('prepared','committed','conflict','abandoned')),
 file_path text,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '24 hours',
 cleanup_path text,
 cleanup_attempts integer not null default 0,
 cleanup_due_at timestamptz not null default now(),
 cleanup_lease uuid,
 cleanup_lease_until timestamptz,
 cleanup_done_at timestamptz,
 cleanup_error text,
 primary key(user_id,request_id)
);
alter table public.vault_save_receipts enable row level security;
revoke all on public.vault_save_receipts from public,anon,authenticated;
create policy vault_save_receipts_owner on public.vault_save_receipts for select to authenticated
 using(user_id=auth.uid() and public.rezlee_account_active(auth.uid()));
grant select on public.vault_save_receipts to authenticated;
create index vault_save_cleanup_due on public.vault_save_receipts(cleanup_due_at)
 where cleanup_path is not null and cleanup_done_at is null and cleanup_attempts<5;
create index vault_save_file_path on public.vault_save_receipts(file_path) where file_path is not null;
create index vault_save_expiry on public.vault_save_receipts(expires_at) where status='prepared';
create index vault_save_cleanup_path on public.vault_save_receipts(cleanup_path) where cleanup_path is not null;
create index documents_storage_path on public.documents(storage_path) where storage_path is not null;

create function public.prepare_rezlee_vault_save(p_home uuid,p_request uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); r public.vault_save_receipts%rowtype; d public.documents%rowtype;
 target uuid; issued date; expires date; file jsonb:=p_payload->'file';
begin
 if caller is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text,742));
 if not public.rezlee_account_active(caller) or not exists(select 1 from public.homes where id=p_home and user_id=caller) then
  raise exception 'Home unavailable' using errcode='42501';
 end if;
 if p_request is null or jsonb_typeof(p_payload) is distinct from 'object'
 or jsonb_typeof(p_payload->'title') is distinct from 'string' or char_length(trim(p_payload->>'title')) not between 1 and 200
 or coalesce(p_payload->>'category','') not in ('Receipt','Warranty','Insurance','Manual','Lease','Contract','Tax','Other')
 or char_length(coalesce(p_payload->>'notes',''))>5000 then raise exception 'Invalid record' using errcode='22023'; end if;
 if coalesce(p_payload->>'issued_on','')<>'' then issued:=(p_payload->>'issued_on')::date; end if;
 if coalesce(p_payload->>'expires_on','')<>'' then expires:=(p_payload->>'expires_on')::date; end if;
 if expires<issued then raise exception 'Invalid dates' using errcode='22023'; end if;
 if file is not null and file<>'null'::jsonb then
  if jsonb_typeof(file) is distinct from 'object' or coalesce(file->>'mime','') not in ('application/pdf','image/jpeg','image/png','image/webp')
   or coalesce(file->>'sha256','') !~ '^[a-f0-9]{64}$' or char_length(coalesce(file->>'name','')) not between 1 and 250
   or coalesce((file->>'size')::bigint,0) not between 1 and 4194304 then raise exception 'Invalid attachment' using errcode='22023'; end if;
 end if;
 select * into r from public.vault_save_receipts where user_id=caller and request_id=p_request for update;
 if found then
  if r.home_id<>p_home or r.payload<>p_payload then raise exception 'Save choices changed' using errcode='22023'; end if;
 else
  target:=nullif(p_payload->>'id','')::uuid;
  if target is not null then
   select * into d from public.documents where id=target and user_id=caller and home_id=p_home for update;
   if not found then raise exception 'Record unavailable' using errcode='P0002'; end if;
   if nullif(p_payload->>'expected_version','') is not null and (p_payload->>'expected_version')::timestamptz<>d.updated_at then
    return jsonb_build_object('status','conflict');
   end if;
  end if;
  insert into public.vault_save_receipts(user_id,request_id,home_id,document_id,payload,base_version,file_path)
  values(caller,p_request,p_home,coalesce(target,gen_random_uuid()),p_payload,d.updated_at,
   case when file is not null and file<>'null'::jsonb then caller::text||'/'||p_home::text||'/saves/'||p_request::text else null end)
  returning * into r;
 end if;
 if r.status='prepared' and r.expires_at<=now() then
  update public.vault_save_receipts set status='abandoned',cleanup_path=file_path where user_id=caller and request_id=p_request returning * into r;
 end if;
 return jsonb_build_object('status',r.status,'id',r.document_id,'path',r.file_path,
  'fileReady',r.file_path is null or exists(select 1 from storage.objects where bucket_id='rezlee-documents' and name=r.file_path),
  'exists',exists(select 1 from public.documents where id=r.document_id and user_id=caller and home_id=p_home));
end $$;

create function public.commit_rezlee_vault_save(p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); r public.vault_save_receipts%rowtype; d public.documents%rowtype; file jsonb; old_path text;
begin
 if caller is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text,742));
 if not public.rezlee_account_active(caller) then raise exception 'Account unavailable' using errcode='42501'; end if;
 select * into r from public.vault_save_receipts where user_id=caller and request_id=p_request for update;
 if not found then raise exception 'Save unavailable' using errcode='P0002'; end if;
 if r.status='committed' then
  return jsonb_build_object('status',case when exists(select 1 from public.documents where id=r.document_id and user_id=caller and home_id=r.home_id) then 'committed' else 'deleted' end,'id',r.document_id);
 end if;
 if r.status<>'prepared' then return jsonb_build_object('status',r.status); end if;
 if r.expires_at<=now() then
  update public.vault_save_receipts set status='abandoned',cleanup_path=file_path where user_id=caller and request_id=p_request;
  return jsonb_build_object('status','abandoned');
 end if;
 if r.file_path is not null and not exists(select 1 from storage.objects where bucket_id='rezlee-documents' and name=r.file_path) then
  return jsonb_build_object('status','upload_pending');
 end if;
 if nullif(r.payload->>'id','') is not null then
  select * into d from public.documents where id=r.document_id and user_id=caller and home_id=r.home_id for update;
  if not found or d.updated_at is distinct from r.base_version then
   update public.vault_save_receipts set status='conflict',cleanup_path=file_path where user_id=caller and request_id=p_request;
   return jsonb_build_object('status','conflict');
  end if;
  old_path:=d.storage_path;
 end if;
 file:=r.payload->'file';
 if nullif(r.payload->>'id','') is null then
  insert into public.documents(id,user_id,home_id,title,category,document_type,issued_on,expires_on,notes,source,storage_path,file_name,mime_type,file_size_bytes)
  values(r.document_id,caller,r.home_id,trim(r.payload->>'title'),r.payload->>'category',r.payload->>'category',
   nullif(r.payload->>'issued_on','')::date,nullif(r.payload->>'expires_on','')::date,nullif(r.payload->>'notes',''),'manual',r.file_path,
   file->>'name',file->>'mime',(file->>'size')::bigint);
 else
  update public.documents set title=trim(r.payload->>'title'),category=r.payload->>'category',document_type=r.payload->>'category',
   issued_on=nullif(r.payload->>'issued_on','')::date,expires_on=nullif(r.payload->>'expires_on','')::date,notes=nullif(r.payload->>'notes',''),
   storage_path=coalesce(r.file_path,storage_path),file_name=case when r.file_path is null then file_name else file->>'name' end,
   mime_type=case when r.file_path is null then mime_type else file->>'mime' end,
   file_size_bytes=case when r.file_path is null then file_size_bytes else (file->>'size')::bigint end
  where id=r.document_id and user_id=caller and home_id=r.home_id;
 end if;
 update public.vault_save_receipts set status='committed',cleanup_path=case when r.file_path is not null and old_path<>r.file_path then old_path else null end
 where user_id=caller and request_id=p_request;
 return jsonb_build_object('status','committed','id',r.document_id);
end $$;

-- Serialize path assignment with cleanup. A retired path must never be attached
-- again after the worker checks references, even via an older/direct DB client.
create function public.guard_retired_vault_attachment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.storage_path is null or (tg_op='UPDATE' and new.storage_path is not distinct from old.storage_path) then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,742));
 if exists(select 1 from public.vault_save_receipts where cleanup_path=new.storage_path) then
  raise exception 'Attachment retired' using errcode='22023';
 end if;
 return new;
end $$;
create trigger guard_retired_vault_attachment before insert or update of storage_path on public.documents
 for each row execute function public.guard_retired_vault_attachment();

-- A timed-out upload cannot recreate a staged object after its receipt expires.
create function public.guard_retired_vault_storage() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if new.bucket_id<>'rezlee-documents' then return new; end if;
 if split_part(new.name,'/',1) !~ '^[a-f0-9-]{36}$' then return new; end if;
 target:=split_part(new.name,'/',1)::uuid;
 perform pg_advisory_xact_lock(hashtextextended(target::text,742));
 if exists(select 1 from public.vault_save_receipts where file_path=new.name and status in ('conflict','abandoned'))
 or exists(select 1 from public.vault_save_receipts where cleanup_path=new.name) then
  raise exception 'Attachment retired' using errcode='22023';
 end if;
 return new;
end $$;
create trigger guard_retired_vault_storage before insert or update on storage.objects
 for each row execute function public.guard_retired_vault_storage();

-- Server-only worker leases; no customer can choose another user's cleanup path.
create function public.claim_rezlee_vault_cleanup(p_lease uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare candidate record; r public.vault_save_receipts%rowtype;
begin
 for candidate in select user_id,request_id from public.vault_save_receipts
  where (status='prepared' and expires_at<=now()) or
  (cleanup_path is not null and cleanup_done_at is null and cleanup_attempts<5 and cleanup_due_at<=now() and (cleanup_lease_until is null or cleanup_lease_until<=now()))
  order by cleanup_due_at limit 20 loop
  if not pg_try_advisory_xact_lock(hashtextextended(candidate.user_id::text,742)) then continue; end if;
  select * into r from public.vault_save_receipts where user_id=candidate.user_id and request_id=candidate.request_id for update skip locked;
  if not found then continue; end if;
  if r.status='prepared' and r.expires_at<=now() then
   update public.vault_save_receipts set status='abandoned',cleanup_path=file_path where user_id=r.user_id and request_id=r.request_id returning * into r;
  end if;
  if r.cleanup_path is null or r.cleanup_done_at is not null or r.cleanup_attempts>=5 or r.cleanup_due_at>now() or r.cleanup_lease_until>now() then continue; end if;
  if r.cleanup_path not like r.user_id::text||'/'||r.home_id::text||'/%' or position('..' in r.cleanup_path)>0 or position(chr(92) in r.cleanup_path)>0
   or exists(select 1 from public.documents where storage_path=r.cleanup_path) then
   update public.vault_save_receipts set cleanup_attempts=5,cleanup_error='path_requires_review' where user_id=r.user_id and request_id=r.request_id;
   continue;
  end if;
  update public.vault_save_receipts set cleanup_lease=p_lease,cleanup_lease_until=now()+interval '3 minutes',cleanup_attempts=cleanup_attempts+1
   where user_id=r.user_id and request_id=r.request_id returning * into r;
  return jsonb_build_object('userId',r.user_id,'homeId',r.home_id,'requestId',r.request_id,'path',r.cleanup_path);
 end loop;
 return null;
end $$;

create function public.finish_rezlee_vault_cleanup(p_user uuid,p_request uuid,p_lease uuid,p_ok boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.vault_save_receipts set cleanup_done_at=case when p_ok then now() else null end,
  cleanup_error=case when p_ok then null else 'storage_unavailable' end,
  cleanup_due_at=now()+make_interval(mins=>least(1440,15*(2^cleanup_attempts)::integer)),cleanup_lease=null,cleanup_lease_until=null
 where user_id=p_user and request_id=p_request and cleanup_lease=p_lease;
end $$;

revoke all on function public.prepare_rezlee_vault_save(uuid,uuid,jsonb),public.commit_rezlee_vault_save(uuid) from public,anon;
grant execute on function public.prepare_rezlee_vault_save(uuid,uuid,jsonb),public.commit_rezlee_vault_save(uuid) to authenticated;
revoke all on function public.guard_retired_vault_storage(),public.guard_retired_vault_attachment(),public.claim_rezlee_vault_cleanup(uuid),public.finish_rezlee_vault_cleanup(uuid,uuid,uuid,boolean) from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant all on public.vault_save_receipts to service_role;
  grant execute on function public.claim_rezlee_vault_cleanup(uuid),public.finish_rezlee_vault_cleanup(uuid,uuid,uuid,boolean) to service_role;
 end if;
end $$;
notify pgrst,'reload schema';
