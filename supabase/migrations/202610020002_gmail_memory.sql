-- Optional Gmail channel. No changes to sign-in, utility schedules or existing customer records.
create table public.gmail_memory_links(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 home_id uuid not null references public.homes(id) on delete cascade,
 email text not null, token_cipher text, status text not null check(status in ('active','paused','reconnect','disconnected')),
 ongoing boolean not null default false, categories text[] not null, excluded_senders text[] not null default '{}',
 work jsonb not null, lease uuid, lease_until timestamptz, generation integer not null default 1, step_attempts integer not null default 0,
 error_code text, next_run timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,home_id)
);
create table public.gmail_memory_oauth(
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 home_id uuid not null references public.homes(id) on delete cascade,
 state_hash text unique not null, verifier_cipher text not null,
 phase text not null default 'authorize', handoff_hash text, token_cipher text, email text,
 categories text[] not null, work jsonb not null, expires_at timestamptz not null default now()+interval '10 minutes'
);
create table public.gmail_memory_seen(
 link_id uuid not null references public.gmail_memory_links(id) on delete cascade,
 message_id text not null, capture_id uuid references public.email_capture_jobs(id) on delete set null,
 disposition text not null, created_at timestamptz not null default now(),primary key(link_id,message_id)
);
alter table public.email_capture_jobs add column source_type text not null default 'manual';
alter table public.email_capture_jobs add column source_meta jsonb;
alter table public.gmail_memory_links enable row level security;
alter table public.gmail_memory_oauth enable row level security;
alter table public.gmail_memory_seen enable row level security;
revoke all on public.gmail_memory_links,public.gmail_memory_oauth,public.gmail_memory_seen from public,anon,authenticated;
grant all on public.gmail_memory_links,public.gmail_memory_oauth,public.gmail_memory_seen to service_role;
create index gmail_memory_due on public.gmail_memory_links(next_run) where status='active';
create trigger guard_deleting_account before insert or update on public.gmail_memory_links
 for each row execute function public.guard_deleting_rezlee_account();
create trigger guard_deleting_account before insert or update on public.gmail_memory_oauth
 for each row execute function public.guard_deleting_rezlee_account();

create function public.confirm_rezlee_gmail(p_id uuid,p_user uuid,p_proof text) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.gmail_memory_oauth%rowtype; r public.gmail_memory_links%rowtype; result uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,743));
 select * into a from public.gmail_memory_oauth where id=p_id and user_id=p_user and phase='confirm' and handoff_hash=p_proof and expires_at>now() for update;
 if not found or a.token_cipher is null or not public.rezlee_account_active(p_user)
 or not exists(select 1 from public.homes where id=a.home_id and user_id=p_user) then raise exception 'Connection expired' using errcode='42501';end if;
 select * into r from public.gmail_memory_links where user_id=p_user and home_id=a.home_id for update;
 if found and lower(r.email)<>lower(a.email) and r.status='disconnected' then
  delete from public.gmail_memory_links where id=r.id; r:=null;
 end if;
 if r.id is not null then
  if lower(r.email)<>lower(a.email) then raise exception 'Disconnect the previous account before changing accounts' using errcode='22023';end if;
  update public.gmail_memory_links set token_cipher=a.token_cipher,status='active',error_code=null,step_attempts=0,lease=null,lease_until=null,generation=generation+1,
   next_run=now(),updated_at=now() where id=r.id returning id into result;
 else
  insert into public.gmail_memory_links(user_id,home_id,email,token_cipher,status,categories,work)
  values(a.user_id,a.home_id,a.email,a.token_cipher,'active',a.categories,a.work) returning id into result;
 end if;
 delete from public.gmail_memory_oauth where user_id=p_user;
 return result;
end $$;

create function public.claim_rezlee_gmail(p_id uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.gmail_memory_links%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('gmail-global-workers',743));
 if (select count(*) from public.gmail_memory_links where lease_until>now())>=3 then return null;end if;
 select * into r from public.gmail_memory_links where id=p_id and status='active' and token_cipher is not null
 and (lease_until is null or lease_until<now()) and next_run<=now() for update skip locked;
 if not found or not public.rezlee_account_active(r.user_id)
 or not exists(select 1 from public.homes where id=r.home_id and user_id=r.user_id) then return null;end if;
 if r.step_attempts>=3 then
  update public.gmail_memory_links set status='paused',error_code='retry',lease=null,lease_until=null where id=r.id;return null;
 end if;
 update public.gmail_memory_links set step_attempts=step_attempts+1,lease=p_lease,lease_until=now()+interval '75 seconds',updated_at=now() where id=r.id;
 return to_jsonb(r);
end $$;

create function public.reserve_rezlee_gmail_ai(p_id uuid,p_lease uuid) returns text
language plpgsql security definer set search_path='' as $$
declare r public.gmail_memory_links%rowtype; previous text; answer text;
begin
 select * into r from public.gmail_memory_links where id=p_id and lease=p_lease and lease_until>now() and status='active';
 if not found or not public.rezlee_account_active(r.user_id) then return 'unavailable';end if;
 previous:=current_setting('request.jwt.claim.sub',true);
 perform set_config('request.jwt.claim.sub',r.user_id::text,true);
 answer:=public.reserve_rezlee_ai_request_v2();
 perform set_config('request.jwt.claim.sub',coalesce(previous,''),true);
 return answer;
end $$;

-- One fenced completion commits the candidate disposition and review proposal together.
create function public.finish_rezlee_gmail_step(p_id uuid,p_lease uuid,p_work jsonb,p_status text,p_error text,
 p_message text default null,p_hash text default null,p_proposal jsonb default null,p_meta jsonb default null,p_disposition text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.gmail_memory_links%rowtype; capture uuid;
begin
 select * into r from public.gmail_memory_links where id=p_id and lease=p_lease and lease_until>now() and status='active' for update;
 if not found or not public.rezlee_account_active(r.user_id) then return false;end if;
 if p_status not in ('active','paused','reconnect') or octet_length(p_work::text)>100000
 or (p_proposal is not null and octet_length(p_proposal::text)>16000) then raise exception 'Invalid work';end if;
 if p_message is not null and not exists(select 1 from public.gmail_memory_seen where link_id=r.id and message_id=p_message) then
  if p_proposal is not null then
   insert into public.email_capture_jobs(id,user_id,home_id,source_hash,status,proposal,source_type,source_meta)
   values(gen_random_uuid(),r.user_id,r.home_id,p_hash,'ready',p_proposal,'gmail',p_meta)
   on conflict(user_id,home_id,source_hash) do nothing returning id into capture;
   if capture is null then select id into capture from public.email_capture_jobs where user_id=r.user_id and home_id=r.home_id and source_hash=p_hash;end if;
  end if;
  insert into public.gmail_memory_seen(link_id,message_id,capture_id,disposition) values(r.id,p_message,capture,coalesce(p_disposition,'ignored')) on conflict do nothing;
 end if;
 update public.gmail_memory_links set work=p_work,status=p_status,error_code=p_error,step_attempts=0,lease=null,lease_until=null,
 next_run=case when p_work->>'phase'='complete' then now()+interval '1 day' else now() end,updated_at=now() where id=r.id;
 return true;
end $$;

revoke all on function public.confirm_rezlee_gmail(uuid,uuid,text),public.claim_rezlee_gmail(uuid,uuid),
 public.reserve_rezlee_gmail_ai(uuid,uuid),public.finish_rezlee_gmail_step(uuid,uuid,jsonb,text,text,text,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.confirm_rezlee_gmail(uuid,uuid,text),public.claim_rezlee_gmail(uuid,uuid),
 public.reserve_rezlee_gmail_ai(uuid,uuid),public.finish_rezlee_gmail_step(uuid,uuid,jsonb,text,text,text,text,jsonb,jsonb,text) to service_role;

-- Review still uses the owner-scoped, transactional existing acceptance function.
-- Its file metadata is supplied by the fenced Gmail worker, never a mobile payload.
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
 result:=public.prepare_rezlee_vault_save(p_home,p_id,p_record||jsonb_build_object('file',case when r.source_type='gmail' then r.source_meta->'file' else null end,'expected_version',null));
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
    due_date,issue_date,status,source,payment_status,current_amount_due,amount_paid,reminder_date,notes,raw_data,original_document_id,original_storage_path)
   values(u,p_home,p_bill->>'name',p_bill->>'custom_provider_name',p_bill->>'account_number_masked','CAD',(p_bill->>'amount')::numeric,
    (p_bill->>'billing_period_start')::date,(p_bill->>'billing_period_end')::date,nullif(p_bill->>'due_date','')::date,nullif(p_bill->>'issue_date','')::date,
    'archived','manual',null,null,null,null,p_bill->>'notes',p_bill->'raw_data',case when r.source_meta->'file' is not null and r.source_meta->'file'<>'null'::jsonb then doc else null end,(select storage_path from public.documents where id=doc)) returning id into bill;
  end if;
 end if;
 update public.email_capture_jobs set status='saved',accepted_payload=payload,proposal=null,document_id=doc,bill_id=bill,updated_at=now() where id=p_id;
 return jsonb_build_object('status','saved','documentId',doc,'billId',bill);
end $$;

notify pgrst,'reload schema';

create or replace function public.discard_rezlee_email_capture(p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); changed integer;
begin
 if u is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,742));
 if not public.rezlee_account_active(u) then raise exception 'Account unavailable' using errcode='42501'; end if;
 update public.email_capture_jobs set status='discarded',proposal=null,accepted_payload=null,source_meta=null,lease=null,lease_until=null,updated_at=now()
 where id=p_id and user_id=u;
 get diagnostics changed=row_count; return changed=1;
end $$;

create or replace function public.purge_deleted_email_record() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not public.rezlee_account_active(old.user_id) then return old; end if;
 perform pg_advisory_xact_lock(hashtextextended(old.user_id::text,742));
 update public.vault_save_receipts set payload=jsonb_build_object('title','Deleted email record','category','Other','issued_on','','expires_on','','notes',''),bill_payload=null
 where user_id=old.user_id and document_id=old.id and request_id in (
  select id from public.email_capture_jobs where user_id=old.user_id and document_id=old.id
 );
 update public.email_capture_jobs set status='discarded',proposal=null,accepted_payload=null,source_meta=null,lease=null,lease_until=null,updated_at=now()
 where user_id=old.user_id and document_id=old.id;
 return old;
end $$;
grant select,insert,update on public.email_capture_jobs to service_role;
