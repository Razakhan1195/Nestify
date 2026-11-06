-- Private decision worksheets; existing Vault originals and quote reviews remain authoritative.
create table public.purchase_decisions(
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 home_id uuid not null references public.homes(id) on delete cascade,
 revision integer not null check(revision>0),
 last_request_id uuid not null,
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=45000),
 updated_at timestamptz not null default now()
);
create index purchase_decisions_owner_home on public.purchase_decisions(user_id,home_id,updated_at desc);
alter table public.purchase_decisions enable row level security;
create policy purchase_decisions_owner on public.purchase_decisions for select to authenticated using(
 user_id=auth.uid() and exists(select 1 from public.homes h where h.id=home_id and h.user_id=auth.uid())
);
create policy rezlee_active_accounts on public.purchase_decisions as restrictive for all to authenticated
 using(public.rezlee_account_active(auth.uid()) and public.rezlee_account_active(user_id))
 with check(public.rezlee_account_active(auth.uid()) and public.rezlee_account_active(user_id));
create policy rezlee_valid_session on public.purchase_decisions as restrictive for all to authenticated
 using(public.rezlee_session_allowed()) with check(public.rezlee_session_allowed());
create trigger guard_deleting_account before insert or update on public.purchase_decisions for each row execute function public.guard_deleting_rezlee_account();
revoke all on public.purchase_decisions from public,anon,authenticated;
grant select on public.purchase_decisions to authenticated;
grant all on public.purchase_decisions to service_role;

-- Server validates the complete bounded schema, then this service-only transaction
-- fences revisions, source changes, owner/home access and concurrent deletion.
create function public.save_rezlee_purchase(p_user uuid,p_home uuid,p_id uuid,p_version integer,p_request uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.purchase_decisions; q jsonb;d public.documents;v public.quote_reviews;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,742));
 if not public.rezlee_account_active(p_user) then raise sqlstate 'PT409' using message='Account unavailable';end if;
 if not exists(select 1 from public.homes where id=p_home and user_id=p_user) then raise sqlstate 'PT404' using message='Home unavailable';end if;
 if p_id is null or p_request is null or p_version is null or p_version<0 or p_payload is null or jsonb_typeof(p_payload)<>'object'
  or octet_length(p_payload::text)>45000 or coalesce(p_payload->>'kind','') not in ('compare','compatibility','replace')
  or coalesce(length(btrim(p_payload->>'title')),0)=0 or jsonb_typeof(p_payload->'quotes') is distinct from 'array'
  or jsonb_array_length(p_payload->'quotes')>3 then raise sqlstate 'PT400' using message='Invalid decision';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,743));
 select * into r from public.purchase_decisions where id=p_id for update;
 if found then
  if r.user_id<>p_user or r.home_id<>p_home then raise sqlstate 'PT404' using message='Decision unavailable';end if;
  if r.last_request_id=p_request then
   if r.payload is distinct from p_payload then raise sqlstate 'PT409' using message='Retry changed';end if;
   return jsonb_build_object('decision',to_jsonb(r),'replayed',true);
  end if;
  if r.revision<>p_version or r.payload->>'kind' is distinct from p_payload->>'kind' then raise sqlstate 'PT409' using message='Decision changed';end if;
 elsif p_version<>0 then raise sqlstate 'PT409' using message='Decision changed';end if;
 -- Lock source documents in a stable order. A revised/deleted original never validates old totals.
 for q in select value from jsonb_array_elements(p_payload->'quotes') order by value->>'documentId' loop
  select * into d from public.documents where id=(q->>'documentId')::uuid and user_id=p_user and home_id=p_home for update;
  if not found then raise sqlstate 'PT404' using message='Quote unavailable';end if;
  select * into v from public.quote_reviews where document_id=d.id and user_id=p_user and home_id=p_home for update;
  if not found or v.source_version is distinct from d.updated_at or d.updated_at is distinct from (q->>'sourceVersion')::timestamptz
   or v.revision is distinct from (q->>'reviewRevision')::integer or v.payload->>'reviewed' is distinct from 'true' then
   raise sqlstate 'PT409' using message='Quote needs review';
  end if;
 end loop;
 insert into public.purchase_decisions(id,user_id,home_id,revision,last_request_id,payload)
 values(p_id,p_user,p_home,1,p_request,p_payload)
 on conflict(id) do update set revision=purchase_decisions.revision+1,last_request_id=excluded.last_request_id,payload=excluded.payload,updated_at=now()
 returning * into r;
 return jsonb_build_object('decision',to_jsonb(r),'replayed',false);
end $$;
revoke all on function public.save_rezlee_purchase(uuid,uuid,uuid,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_rezlee_purchase(uuid,uuid,uuid,integer,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
