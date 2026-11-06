-- Private quote reviews reuse Vault originals. No household permission expansion.
create table public.quote_reviews (
 document_id uuid primary key references public.documents(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 home_id uuid not null references public.homes(id) on delete cascade,
 revision integer not null default 0 check(revision>=0),
 source_version timestamptz not null,
 payload jsonb check(payload is null or (jsonb_typeof(payload)='object' and octet_length(payload::text)<=50000)),
 read_status text not null default 'idle' check(read_status in ('idle','reading','ready','failed')),
 read_started_at timestamptz,
 read_request_id uuid,
 read_result jsonb check(read_result is null or (jsonb_typeof(read_result)='array' and octet_length(read_result::text)<=40000)),
 last_request_id uuid, last_action text, last_payload jsonb,
 item_id uuid references public.inventory_items(id) on delete set null,
 issue_id uuid references public.repair_issues(id) on delete set null,
 invoice_id uuid references public.documents(id) on delete set null,
 updated_at timestamptz not null default now()
);
create index quote_reviews_owner_home on public.quote_reviews(user_id,home_id,updated_at desc);
alter table public.quote_reviews enable row level security;
create policy quote_reviews_owner_read on public.quote_reviews for select to authenticated using(
 user_id=auth.uid() and exists(select 1 from public.documents d where d.id=document_id and d.user_id=auth.uid() and d.home_id=quote_reviews.home_id)
);
revoke all on public.quote_reviews from public,anon,authenticated;
grant select on public.quote_reviews to authenticated;
grant all on public.quote_reviews to service_role;

create function public.change_rezlee_quote(
 p_document uuid,p_home uuid,p_source timestamptz,p_version integer,p_request uuid,p_action text,p_payload jsonb default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.documents; r public.quote_reviews; v_item uuid;v_issue uuid;v_invoice uuid;
begin
 if auth.uid() is null then raise sqlstate 'PT401' using message='Sign in required'; end if;
 select * into d from public.documents where id=p_document and user_id=auth.uid() and home_id=p_home for update;
 if not found then raise sqlstate 'PT404' using message='Quote unavailable';end if;
 if d.updated_at is distinct from p_source then raise sqlstate 'PT409' using message='Original changed';end if;
 if p_request is null or p_version is null or p_version<0 or p_action not in ('save','read','cancel') then raise sqlstate 'PT400' using message='Invalid change';end if;
 insert into public.quote_reviews(document_id,user_id,home_id,source_version) values(d.id,auth.uid(),d.home_id,d.updated_at) on conflict do nothing;
 select * into r from public.quote_reviews where document_id=d.id for update;
 if r.user_id<>auth.uid() or r.home_id<>p_home then raise sqlstate 'PT404' using message='Quote unavailable';end if;
 if r.last_request_id=p_request then
  if r.last_action is distinct from p_action or r.last_payload is distinct from p_payload then raise sqlstate 'PT409' using message='Retry changed';end if;
  return jsonb_build_object('review',to_jsonb(r),'replayed',true);
 end if;
 if r.revision<>p_version then raise sqlstate 'PT409' using message='Review changed';end if;
 if p_action<>'cancel' and r.source_version=d.updated_at and r.read_status='reading' and r.read_started_at>now()-interval '120 seconds' then raise sqlstate 'PT409' using message='Reading in progress';end if;
 if p_action='save' then
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>50000 or jsonb_typeof(p_payload->'fields') is distinct from 'object'
   or coalesce(p_payload->>'decision','') not in ('considering','questions','proceed','declined') then raise sqlstate 'PT400' using message='Invalid review';end if;
  v_item=(p_payload->>'itemId')::uuid;v_issue=(p_payload->>'issueId')::uuid;v_invoice=(p_payload->>'invoiceId')::uuid;
  if (v_item is not null and not exists(select 1 from public.inventory_items where id=v_item and user_id=auth.uid() and home_id=p_home))
   or (v_issue is not null and not exists(select 1 from public.repair_issues where id=v_issue and user_id=auth.uid() and home_id=p_home))
   or (v_invoice is not null and (v_invoice=d.id or not exists(select 1 from public.documents where id=v_invoice and user_id=auth.uid() and home_id=p_home))) then raise sqlstate 'PT404' using message='Linked record unavailable';end if;
 end if;
 update public.quote_reviews set
  revision=revision+1,source_version=d.updated_at,updated_at=now(),last_request_id=p_request,last_action=p_action,last_payload=p_payload,
  payload=case when p_action='save' then p_payload when source_version is distinct from d.updated_at and payload is not null then payload || '{"reviewed":false,"decision":"considering"}'::jsonb else payload end,
  item_id=case when p_action='save' then v_item else item_id end,
  issue_id=case when p_action='save' then v_issue else issue_id end,
  invoice_id=case when p_action='save' then v_invoice else invoice_id end,
  read_status=case when p_action='read' then 'reading' when p_action='cancel' or source_version is distinct from d.updated_at then 'idle' else read_status end,
  read_result=case when p_action='read' or source_version is distinct from d.updated_at then null else read_result end,
  read_started_at=case when p_action='read' then now() else read_started_at end,
  read_request_id=case when p_action='read' then p_request else null end
 where document_id=d.id returning * into r;
 return jsonb_build_object('review',to_jsonb(r),'replayed',false);
end $$;

create function public.finish_rezlee_quote(p_document uuid,p_request uuid,p_result jsonb) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.documents;
begin
 select * into d from public.documents where id=p_document and user_id=auth.uid() for update;
 if not found then return false;end if;
 if p_result is not null and (jsonb_typeof(p_result)<>'array' or octet_length(p_result::text)>40000) then raise sqlstate 'PT400' using message='Invalid result';end if;
 update public.quote_reviews set revision=revision+1,read_status=case when p_result is null then 'failed' else 'ready' end,
  read_result=p_result,updated_at=now()
 where document_id=d.id and user_id=auth.uid() and home_id=d.home_id and source_version=d.updated_at
  and read_status='reading' and read_request_id=p_request and read_started_at>now()-interval '120 seconds';
 return found;
end $$;
revoke all on function public.change_rezlee_quote(uuid,uuid,timestamptz,integer,uuid,text,jsonb) from public,anon;
revoke all on function public.finish_rezlee_quote(uuid,uuid,jsonb) from public,anon;
grant execute on function public.change_rezlee_quote(uuid,uuid,timestamptz,integer,uuid,text,jsonb) to authenticated;
grant execute on function public.finish_rezlee_quote(uuid,uuid,jsonb) to authenticated;
