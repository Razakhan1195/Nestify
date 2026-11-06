-- Optional manual email capture. No mailbox credentials, schedules or provider calls.
-- Apply before enabling REZLEE_EMAIL_CAPTURE_ENABLED. Existing tables remain unchanged.
create table public.email_capture_jobs (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 home_id uuid not null references public.homes(id) on delete cascade,
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 status text not null check(status in ('reading','ready','failed','ignored','saved','discarded')),
 lease uuid, lease_until timestamptz, attempts integer not null default 1 check(attempts between 1 and 3),
 proposal jsonb, accepted_payload jsonb, document_id uuid, bill_id uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,home_id,source_hash)
);
alter table public.email_capture_jobs enable row level security;
revoke all on public.email_capture_jobs from public,anon,authenticated;
grant select on public.email_capture_jobs to authenticated;
create policy email_capture_owner on public.email_capture_jobs for select to authenticated
 using(user_id=auth.uid() and public.rezlee_account_active(auth.uid())
 and exists(select 1 from public.homes where id=home_id and user_id=auth.uid()));
create index email_capture_recent on public.email_capture_jobs(user_id,home_id,created_at desc);
create trigger guard_deleting_account before insert or update on public.email_capture_jobs
 for each row execute function public.guard_deleting_rezlee_account();

create function public.begin_rezlee_email_capture(p_home uuid,p_id uuid,p_hash text,p_lease uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); r public.email_capture_jobs%rowtype;
begin
 if u is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,742));
 if not public.rezlee_account_active(u) or not exists(select 1 from public.homes where id=p_home and user_id=u)
 then raise exception 'Home unavailable' using errcode='42501'; end if;
 if p_id is null or p_lease is null or p_hash !~ '^[a-f0-9]{64}$' or p_hash is null then raise exception 'Invalid capture' using errcode='22023'; end if;
 select * into r from public.email_capture_jobs where id=p_id;
 if found and (r.user_id<>u or r.home_id<>p_home or r.source_hash<>p_hash) then raise exception 'Capture changed' using errcode='22023'; end if;
 select * into r from public.email_capture_jobs where user_id=u and home_id=p_home and source_hash=p_hash for update;
 if found then
  if r.status='reading' and r.lease_until<=now() then r.status:='failed'; end if;
  if r.status='failed' and r.attempts<3 then
   if (select count(*) from public.email_capture_jobs where user_id=u and id<>r.id and status='reading' and lease_until>now())>=2
   then raise exception 'Capture limit reached' using errcode='54000'; end if;
   update public.email_capture_jobs set status='reading',lease=p_lease,lease_until=now()+interval '60 seconds',attempts=attempts+1,updated_at=now()
    where id=r.id returning * into r;
   return jsonb_build_object('id',r.id,'status',r.status,'run',true);
  end if;
  return jsonb_build_object('id',r.id,'status',r.status,'run',false);
 end if;
 if (select count(*) from public.email_capture_jobs where user_id=u and status='reading' and lease_until>now())>=2
 or (select count(*) from public.email_capture_jobs where user_id=u and created_at>now()-interval '1 day')>=30
 then raise exception 'Capture limit reached' using errcode='54000'; end if;
 insert into public.email_capture_jobs(id,user_id,home_id,source_hash,status,lease,lease_until)
 values(p_id,u,p_home,p_hash,'reading',p_lease,now()+interval '60 seconds');
 return jsonb_build_object('id',p_id,'status','reading','run',true);
end $$;

create function public.finish_rezlee_email_capture(p_id uuid,p_lease uuid,p_status text,p_proposal jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); changed integer;
begin
 if u is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,742));
 if not public.rezlee_account_active(u) then raise exception 'Account unavailable' using errcode='42501'; end if;
 if p_status not in ('ready','failed','ignored') or (p_status='ready' and (p_proposal is null or jsonb_typeof(p_proposal)<>'object' or octet_length(p_proposal::text)>12000))
 then raise exception 'Invalid result' using errcode='22023'; end if;
 update public.email_capture_jobs set status=p_status,proposal=case when p_status='ready' then p_proposal else null end,
  lease=null,lease_until=null,updated_at=now()
 where id=p_id and user_id=u and status='reading' and lease=p_lease and lease_until>now();
 get diagnostics changed=row_count; return changed=1;
end $$;

create function public.discard_rezlee_email_capture(p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); changed integer;
begin
 if u is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,742));
 if not public.rezlee_account_active(u) then raise exception 'Account unavailable' using errcode='42501'; end if;
 update public.email_capture_jobs set status='discarded',proposal=null,accepted_payload=null,lease=null,lease_until=null,updated_at=now()
 where id=p_id and user_id=u;
 get diagnostics changed=row_count; return changed=1;
end $$;

-- All accepted outcomes commit together or not at all. Existing Vault save and bill
-- period uniqueness rules remain the source of truth; repeats never overwrite them.
create function public.accept_rezlee_email_capture(p_id uuid,p_home uuid,p_record jsonb,p_bill jsonb default null)
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
 result:=public.prepare_rezlee_vault_save(p_home,p_id,p_record||'{"file":null,"expected_version":null}'::jsonb);
 if result->>'status' not in ('prepared','committed') then raise exception 'Record save unavailable' using errcode='55000'; end if;
 result:=public.commit_rezlee_vault_save(p_id);
 if result->>'status'<>'committed' then raise exception 'Record save unavailable' using errcode='55000'; end if;
 doc:=(result->>'id')::uuid;
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
    due_date,issue_date,status,source,payment_status,current_amount_due,amount_paid,reminder_date,notes,raw_data)
   values(u,p_home,p_bill->>'name',p_bill->>'custom_provider_name',p_bill->>'account_number_masked','CAD',(p_bill->>'amount')::numeric,
    (p_bill->>'billing_period_start')::date,(p_bill->>'billing_period_end')::date,nullif(p_bill->>'due_date','')::date,nullif(p_bill->>'issue_date','')::date,
    'archived','manual',null,null,null,null,p_bill->>'notes',p_bill->'raw_data') returning id into bill;
  end if;
 end if;
 update public.email_capture_jobs set status='saved',accepted_payload=payload,proposal=null,document_id=doc,bill_id=bill,updated_at=now() where id=p_id;
 return jsonb_build_object('status','saved','documentId',doc,'billId',bill);
end $$;

revoke all on function public.begin_rezlee_email_capture(uuid,uuid,text,uuid),
 public.finish_rezlee_email_capture(uuid,uuid,text,jsonb),public.discard_rezlee_email_capture(uuid),
 public.accept_rezlee_email_capture(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.begin_rezlee_email_capture(uuid,uuid,text,uuid),
 public.finish_rezlee_email_capture(uuid,uuid,text,jsonb),public.discard_rezlee_email_capture(uuid),
 public.accept_rezlee_email_capture(uuid,uuid,jsonb,jsonb) to authenticated;

-- Deleting an email-derived Vault record also removes copied review evidence from
-- this new journal and its metadata-only save receipt. Other capture flows untouched.
create function public.purge_deleted_email_record() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not public.rezlee_account_active(old.user_id) then return old; end if;
 perform pg_advisory_xact_lock(hashtextextended(old.user_id::text,742));
 update public.vault_save_receipts set payload=jsonb_build_object('title','Deleted email record','category','Other','issued_on','','expires_on','','notes',''),bill_payload=null
 where user_id=old.user_id and document_id=old.id and request_id in (
  select id from public.email_capture_jobs where user_id=old.user_id and document_id=old.id
 );
 update public.email_capture_jobs set status='discarded',proposal=null,accepted_payload=null,lease=null,lease_until=null,updated_at=now()
 where user_id=old.user_id and document_id=old.id;
 return old;
end $$;
revoke all on function public.purge_deleted_email_record() from public,anon,authenticated;
create trigger purge_deleted_email_record after delete on public.documents
 for each row execute function public.purge_deleted_email_record();

notify pgrst,'reload schema';
