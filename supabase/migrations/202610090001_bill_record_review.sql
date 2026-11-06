-- Additive, owner-private evidence and explicitly confirmed duplicate choices.
-- Existing bills, originals, provider identities and payment fields are not rewritten.
create function public.rezlee_bill_snapshot(b public.bills) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('historical',b.status='archived','amount',b.amount,'currency',b.currency,'periodStart',b.billing_period_start,'periodEnd',b.billing_period_end,
 'issueDate',b.issue_date,'dueDate',b.due_date,'account',b.account_number_masked,'providerId',b.provider_id,'providerName',b.custom_provider_name,
 'source',b.source,'category',b.raw_data->>'category','amountBasis',case when b.source='ezgb' then 'amount_due_when_issued' else coalesce(b.raw_data->>'amount_basis','recorded_amount') end,
 'usage',b.usage_amount,'unit',b.usage_unit,'lineItems',b.line_items,'originalDocumentId',b.original_document_id,
 'evidence',b.raw_data->'statement_evidence','energyEvidence',b.raw_data->'statement_energy_evidence')
$$;
create function public.rezlee_bill_fingerprint(b public.bills) returns text
language sql immutable set search_path='' as $$ select md5(public.rezlee_bill_snapshot(b)::text) $$;

create table public.bill_record_versions (
 id uuid primary key default gen_random_uuid(),
 bill_id uuid not null references public.bills(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 home_id uuid not null references public.homes(id) on delete cascade,
 snapshot jsonb not null, recorded_at timestamptz not null default now()
);
create index bill_record_versions_bill_idx on public.bill_record_versions(bill_id,recorded_at desc);
alter table public.bill_record_versions enable row level security;
create policy bill_record_versions_owner on public.bill_record_versions for select to authenticated using(user_id=auth.uid());
grant select on public.bill_record_versions to authenticated;
grant all on public.bill_record_versions to service_role;
create function public.retain_rezlee_bill_version() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if public.rezlee_bill_snapshot(old) is distinct from public.rezlee_bill_snapshot(new) then
  insert into public.bill_record_versions(bill_id,user_id,home_id,snapshot)
  values(old.id,old.user_id,old.home_id,public.rezlee_bill_snapshot(old));
 end if;
 return new;
end $$;
create trigger retain_rezlee_bill_version after update on public.bills for each row execute function public.retain_rezlee_bill_version();
revoke all on function public.retain_rezlee_bill_version() from public,anon,authenticated;

create table public.bill_record_choices (
 user_id uuid not null references auth.users(id) on delete cascade,
 home_id uuid not null references public.homes(id) on delete cascade,
 first_bill_id uuid not null references public.bills(id) on delete cascade,
 second_bill_id uuid not null references public.bills(id) on delete cascade,
 selected_bill_id uuid references public.bills(id) on delete cascade,
 first_fingerprint text not null, second_fingerprint text not null,
 updated_at timestamptz not null default now(),
 primary key(first_bill_id,second_bill_id),
 check(first_bill_id<second_bill_id),
 check(selected_bill_id is null or selected_bill_id in(first_bill_id,second_bill_id))
);
create index bill_record_choices_home_idx on public.bill_record_choices(user_id,home_id);
alter table public.bill_record_choices enable row level security;
create policy bill_record_choices_owner on public.bill_record_choices for select to authenticated using(user_id=auth.uid());
grant select on public.bill_record_choices to authenticated;
grant all on public.bill_record_choices to service_role;

-- A changed amount/period/evidence invalidates a choice automatically. Nothing
-- disappears because of a name match, and old clients keep their existing table.
create view public.rezlee_effective_bills with (security_invoker=true) as
 select b.* from public.bills b where not exists (
  select 1 from public.bill_record_choices c
  join public.bills x on x.id=c.first_bill_id
  join public.bills y on y.id=c.second_bill_id
  where b.id in(c.first_bill_id,c.second_bill_id) and c.selected_bill_id is not null and c.selected_bill_id<>b.id
  and c.user_id=b.user_id and c.home_id=b.home_id
  and c.first_fingerprint=public.rezlee_bill_fingerprint(x)
  and c.second_fingerprint=public.rezlee_bill_fingerprint(y)
 );
grant select on public.rezlee_effective_bills to authenticated,service_role;

create function public.choose_rezlee_bill_record(p_first uuid,p_second uuid,p_first_fingerprint text,p_second_fingerprint text,p_selected uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); a public.bills%rowtype; b public.bills%rowtype; first_id uuid;second_id uuid; losing uuid; f text; s text;
begin
 if u is null or not public.rezlee_account_active(u) then raise exception 'Sign in required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,742));
 select * into a from public.bills where id=p_first and user_id=u for update;
 select * into b from public.bills where id=p_second and user_id=u for update;
 if a.id is null or b.id is null or a.id=b.id or a.home_id<>b.home_id then raise exception 'Statements unavailable' using errcode='42501';end if;
 if public.rezlee_bill_fingerprint(a) is distinct from p_first_fingerprint or public.rezlee_bill_fingerprint(b) is distinct from p_second_fingerprint then raise exception 'Statements changed' using errcode='40001';end if;
 if p_selected is not null and p_selected not in(a.id,b.id) then raise exception 'Invalid choice' using errcode='22023';end if;
 if p_selected is not null and (a.status<>'archived' or b.status<>'archived' or a.currency<>b.currency or a.billing_period_start is null or a.billing_period_end is null
 or a.billing_period_start is distinct from b.billing_period_start or a.billing_period_end is distinct from b.billing_period_end)
 then raise exception 'Periods differ' using errcode='22023';end if;
 if p_selected is not null and ((public.rezlee_bill_snapshot(a)->>'amountBasis') not in ('period_charges','amount_due_when_issued','statement_total')
 or (public.rezlee_bill_snapshot(a)->>'amountBasis') is distinct from (public.rezlee_bill_snapshot(b)->>'amountBasis'))
 then raise exception 'Amounts describe different information' using errcode='22023';end if;
 first_id:=least(a.id,b.id);second_id:=greatest(a.id,b.id);
 f:=case when first_id=a.id then p_first_fingerprint else p_second_fingerprint end;
 s:=case when second_id=b.id then p_second_fingerprint else p_first_fingerprint end;
 if p_selected is not null then
  losing:=case when p_selected=a.id then b.id else a.id end;
  -- Do not create chains or conflicting choices. Stale choices no longer count.
  if exists(select 1 from public.bill_record_choices c join public.bills x on x.id=c.first_bill_id join public.bills y on y.id=c.second_bill_id
   where c.user_id=u and (c.first_bill_id,c.second_bill_id)<>(first_id,second_id)
   and c.selected_bill_id is not null and c.first_fingerprint=public.rezlee_bill_fingerprint(x) and c.second_fingerprint=public.rezlee_bill_fingerprint(y)
   and (c.selected_bill_id=losing or (p_selected in(c.first_bill_id,c.second_bill_id) and c.selected_bill_id<>p_selected)))
  then raise exception 'Review the existing choice first' using errcode='40001';end if;
 end if;
 insert into public.bill_record_choices(user_id,home_id,first_bill_id,second_bill_id,selected_bill_id,first_fingerprint,second_fingerprint)
 values(u,a.home_id,first_id,second_id,p_selected,f,s)
 on conflict(first_bill_id,second_bill_id) do update set selected_bill_id=excluded.selected_bill_id,first_fingerprint=excluded.first_fingerprint,second_fingerprint=excluded.second_fingerprint,updated_at=now();
 return jsonb_build_object('ok',true,'selectedBillId',p_selected);
end $$;
revoke all on function public.rezlee_bill_snapshot(public.bills),public.rezlee_bill_fingerprint(public.bills),public.choose_rezlee_bill_record(uuid,uuid,text,text,uuid) from public,anon;
grant execute on function public.rezlee_bill_snapshot(public.bills),public.rezlee_bill_fingerprint(public.bills) to authenticated,service_role;
grant execute on function public.choose_rezlee_bill_record(uuid,uuid,text,text,uuid) to authenticated;
notify pgrst,'reload schema';

create function public.rezlee_bill_record_summary(b public.bills) returns jsonb
language sql stable set search_path='' as $$
 select public.rezlee_bill_snapshot(b)||jsonb_build_object('id',b.id,'name',b.name,'fingerprint',public.rezlee_bill_fingerprint(b),
 'source',case when exists(select 1 from public.email_capture_jobs e where e.user_id=b.user_id and e.bill_id=b.id and e.status='saved') then 'email' when b.source='manual' and b.raw_data->>'reviewed_upload'='true' then 'upload' else b.source end,
 'providerName',coalesce(nullif(b.custom_provider_name,''),(select coalesce(p.display_name,p.name) from public.providers p where p.id=b.provider_id),b.raw_data->>'utility',b.name),
 'amountBasis',case when b.source='ezgb' then 'amount_due_when_issued' else coalesce(b.raw_data->>'amount_basis','recorded_amount') end)
$$;
revoke all on function public.rezlee_bill_record_summary(public.bills) from public,anon;
grant execute on function public.rezlee_bill_record_summary(public.bills) to authenticated,service_role;
create function public.get_rezlee_bill_records(p_bill uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); b public.bills%rowtype; candidates jsonb;choices jsonb;versions jsonb;
begin
 if u is null or not public.rezlee_account_active(u) then raise exception 'Sign in required' using errcode='42501';end if;
 select * into b from public.bills where id=p_bill and user_id=u;
 if not found then raise exception 'Statement unavailable' using errcode='P0002';end if;
 select coalesce(jsonb_agg(public.rezlee_bill_record_summary(x)),'[]'::jsonb) into candidates from (
  select * from public.bills x where x.user_id=u and x.home_id=b.home_id and x.id<>b.id
  and x.currency=b.currency and x.billing_period_start=b.billing_period_start and x.billing_period_end=b.billing_period_end
  order by x.id limit 51
 ) x;
 select coalesce(jsonb_agg(jsonb_build_object('firstId',c.first_bill_id,'secondId',c.second_bill_id,'selectedId',c.selected_bill_id,
 'current',c.first_fingerprint=public.rezlee_bill_fingerprint(x) and c.second_fingerprint=public.rezlee_bill_fingerprint(y),
 'other',public.rezlee_bill_record_summary(case when b.id=x.id then y else x end))),'[]'::jsonb)
 into choices from public.bill_record_choices c join public.bills x on x.id=c.first_bill_id join public.bills y on y.id=c.second_bill_id
 where c.user_id=u and c.home_id=b.home_id and b.id in(c.first_bill_id,c.second_bill_id);
 select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'recordedAt',v.recorded_at,'snapshot',v.snapshot)),'[]'::jsonb)
 into versions from (select * from public.bill_record_versions where bill_id=b.id and user_id=u order by recorded_at desc,id desc limit 21) v;
 return jsonb_build_object('bill',public.rezlee_bill_record_summary(b),'candidates',candidates,'choices',choices,'versions',versions);
end $$;
revoke all on function public.get_rezlee_bill_records(uuid) from public,anon;
grant execute on function public.get_rezlee_bill_records(uuid) to authenticated;
notify pgrst,'reload schema';

create index if not exists email_capture_bill_source_idx on public.email_capture_jobs(user_id,bill_id) where bill_id is not null;
