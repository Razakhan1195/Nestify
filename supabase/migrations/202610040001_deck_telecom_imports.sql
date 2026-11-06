-- Customer-started work only. Service-only queues; no scheduled provider pulls.
create table public.deck_telecom_imports (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 home_id uuid not null references public.homes(id) on delete cascade, provider_id uuid not null references public.providers(id) on delete cascade,
 status text not null default 'preparing' check(status in ('preparing','queued','running','verification','completed','partial','failed','canceled')),
 credential_id text, session_id text, phases jsonb not null, phase_index integer not null default 0,
 task_run_id text, sync_run_id uuid, run_attempt integer not null default 0,
 since_date date not null, until_date date not null, accounts jsonb not null default '[]', coverage jsonb not null default '[]',
 bill_ids jsonb not null default '[]', original_ids jsonb not null default '[]', all_complete boolean not null default true,
 message text not null default 'Preparing your bill import.', challenge_key text, verification_expires_at timestamptz,
 lease_token uuid, lease_until timestamptz, next_attempt_at timestamptz not null default now(), failures integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), finished_at timestamptz
);
create unique index deck_telecom_one_active on public.deck_telecom_imports(provider_id) where status in ('preparing','queued','running','verification');
create index deck_telecom_pending on public.deck_telecom_imports(next_attempt_at) where status in ('queued','running','verification');
alter table public.deck_telecom_imports enable row level security;
revoke all on public.deck_telecom_imports from anon,authenticated;
create trigger deck_telecom_import_updated before update on public.deck_telecom_imports for each row execute function public.set_updated_at();
create table public.deck_telecom_snapshots (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 provider_id uuid not null references public.providers(id) on delete cascade, bill_id uuid not null references public.bills(id) on delete cascade,
 task_run_id text not null, payload jsonb not null, created_at timestamptz not null default now(), unique(bill_id,task_run_id)
);
alter table public.deck_telecom_snapshots enable row level security;
revoke all on public.deck_telecom_snapshots from anon,authenticated;
create table public.deck_telecom_pushes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 provider_id uuid not null references public.providers(id) on delete cascade, import_id uuid not null references public.deck_telecom_imports(id) on delete cascade,
 event_key text not null unique, kind text not null check(kind in ('verification','complete','stopped')),
 title text not null, body text not null, expires_at timestamptz, delivered_tokens jsonb not null default '[]',
 ticket_ids jsonb not null default '[]', status text not null default 'pending' check(status in ('pending','sent','expired','no_device','failed')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(),lease_token uuid,lease_until timestamptz,
 created_at timestamptz not null default now()
);
alter table public.deck_telecom_pushes enable row level security;
revoke all on public.deck_telecom_pushes from anon,authenticated;
create unique index deck_telecom_bill_identity on public.bills(user_id,provider_id,external_bill_id) where external_bill_id like 'deck-telco-%';
-- Saving is serialized with disconnect via the provider row; original snapshots are append-only.
create function public.save_rezlee_telecom_bill(p_job uuid,p_lease uuid,p_run text,p_bill jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare j public.deck_telecom_imports%rowtype;p public.providers%rowtype;b public.bills%rowtype;v uuid;
begin
 select * into j from public.deck_telecom_imports where id=p_job;
 if not found or j.lease_token is distinct from p_lease or j.lease_until<=now() or j.status not in ('running','verification') or j.task_run_id<>p_run then raise exception 'Import changed' using errcode='42501';end if;
 select * into p from public.providers where id=j.provider_id for update;
 if not found or p.user_id<>j.user_id or p.home_id<>j.home_id or p.deck_credential_id is distinct from j.credential_id or p.connection_status='disconnected' then raise exception 'Connection changed' using errcode='42501';end if;
 if p_bill->>'external_bill_id' not like 'deck-telco-%' or p_bill->>'user_id'<>j.user_id::text or p_bill->>'provider_id'<>p.id::text then raise exception 'Invalid bill' using errcode='22023';end if;
 select * into b from public.bills where user_id=j.user_id and provider_id=p.id and external_bill_id=p_bill->>'external_bill_id' for update;
 v:=coalesce(b.id,gen_random_uuid());
 if b.id is null then
  insert into public.bills(id,user_id,home_id,provider_id,provider_connection_id,external_bill_id,name,amount,currency,due_date,issue_date,billing_period_start,billing_period_end,account_number_masked,current_amount_due,amount_paid,payment_date,payment_status,status,source,raw_data,line_items,detected_fees,pdf_available,autopay_status,autopay_scheduled_amount,autopay_scheduled_date)
  values(v,j.user_id,j.home_id,p.id,p.id,p_bill->>'external_bill_id',p_bill->>'name',(p_bill->>'amount')::numeric,p_bill->>'currency',nullif(p_bill->>'due_date','')::date,(p_bill->>'issue_date')::date,nullif(p_bill->>'billing_period_start','')::date,nullif(p_bill->>'billing_period_end','')::date,p_bill->>'account_number_masked',(p_bill->>'current_amount_due')::numeric,(p_bill->>'amount_paid')::numeric,nullif(p_bill->>'payment_date','')::date,p_bill->>'payment_status',p_bill->>'status','deck',p_bill->'raw_data',p_bill->'line_items',p_bill->'detected_fees',false,p_bill->>'autopay_status',(p_bill->>'autopay_scheduled_amount')::numeric,nullif(p_bill->>'autopay_scheduled_date','')::date);
 else
  -- Preserve user-recorded payments, current/archived state and already-attached originals.
  update public.bills set amount=(p_bill->>'amount')::numeric,current_amount_due=(p_bill->>'current_amount_due')::numeric,
   raw_data=p_bill->'raw_data',line_items=p_bill->'line_items',detected_fees=p_bill->'detected_fees'
  where id=b.id;
 end if;
 insert into public.deck_telecom_snapshots(user_id,provider_id,bill_id,task_run_id,payload) values(j.user_id,p.id,v,p_run,p_bill) on conflict(bill_id,task_run_id) do nothing;
 return v;
end $$;
revoke all on function public.save_rezlee_telecom_bill(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_rezlee_telecom_bill(uuid,uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
create function public.attach_rezlee_telecom_original(p_job uuid,p_lease uuid,p_bill uuid,p_document uuid,p_path text,p_name text,p_size integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare j public.deck_telecom_imports%rowtype;p public.providers%rowtype;b public.bills%rowtype;
begin
 select * into j from public.deck_telecom_imports where id=p_job;
 if not found or j.lease_token is distinct from p_lease or j.lease_until<=now() or j.status not in ('running','verification') then raise exception 'Import changed' using errcode='42501';end if;
 select * into p from public.providers where id=j.provider_id for update;
 if p.deck_credential_id is distinct from j.credential_id or p.connection_status='disconnected' then raise exception 'Connection changed' using errcode='42501';end if;
 select * into b from public.bills where id=p_bill and user_id=j.user_id and home_id=j.home_id and provider_id=j.provider_id for update;
 if not found or p_path not like j.user_id::text||'/'||j.home_id::text||'/deck/%' or position('..' in p_path)>0 or p_size<1 or p_size>10485760 then raise exception 'Original unavailable' using errcode='42501';end if;
 insert into public.documents(id,user_id,home_id,title,category,document_type,issued_on,notes,source,storage_path,file_name,mime_type,file_size_bytes)
 values(p_document,j.user_id,j.home_id,b.name||' · '||b.issue_date::text,'Other','Statement',b.issue_date,'Original provider statement.','deck',p_path,left(p_name,250),'application/pdf',p_size) on conflict(id) do nothing;
 if not exists(select 1 from public.documents where id=p_document and user_id=j.user_id and home_id=j.home_id and storage_path=p_path) then raise exception 'Original changed' using errcode='42501';end if;
 -- A corrected PDF is kept separately in Vault; never replace the first original silently.
 update public.bills set original_document_id=coalesce(original_document_id,p_document),original_storage_path=coalesce(original_storage_path,p_path),pdf_available=true where id=b.id;
 return p_document;
end $$;
revoke all on function public.attach_rezlee_telecom_original(uuid,uuid,uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.attach_rezlee_telecom_original(uuid,uuid,uuid,uuid,text,text,integer) to service_role;
grant all on public.deck_telecom_imports,public.deck_telecom_snapshots,public.deck_telecom_pushes to service_role;
