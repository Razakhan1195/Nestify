-- Enquiries and written offers must survive replacement of imported bill metadata.
create table public.connected_bill_reviews (
 bill_id uuid primary key references public.bills(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 home_id uuid not null references public.homes(id) on delete cascade,
 revision integer not null default 1 check(revision>0),
 review jsonb not null check(jsonb_typeof(review)='object' and octet_length(review::text)<=48000),
 updated_at timestamptz not null default now()
);
create index connected_bill_reviews_owner on public.connected_bill_reviews(user_id,home_id,updated_at desc);
alter table public.connected_bill_reviews enable row level security;
revoke all on public.connected_bill_reviews from public,anon;
grant select,insert,update,delete on public.connected_bill_reviews to authenticated;
grant all on public.connected_bill_reviews to service_role;
create policy connected_bill_review_owner on public.connected_bill_reviews for all to authenticated
 using(user_id=auth.uid() and exists(select 1 from public.bills b where b.id=bill_id and b.user_id=auth.uid() and b.home_id=connected_bill_reviews.home_id))
 with check(user_id=auth.uid() and exists(select 1 from public.bills b where b.id=bill_id and b.user_id=auth.uid() and b.home_id=connected_bill_reviews.home_id));
create function public.save_rezlee_connected_bill_review(p_bill_id uuid,p_bill_version timestamptz,p_revision integer,p_review jsonb)
 returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare b public.bills%rowtype; current_revision integer; next_revision integer;
begin
 select * into b from public.bills where id=p_bill_id and user_id=auth.uid() for update;
 if not found or b.source not in ('deck','ezgb') or b.currency<>'CAD' or b.status in ('draft','incomplete') then raise exception 'Statement unavailable' using errcode='42501';end if;
 if b.updated_at is distinct from p_bill_version then raise exception 'Statement changed' using errcode='PT409';end if;
 select revision into current_revision from public.connected_bill_reviews where bill_id=p_bill_id;
 if coalesce(current_revision,0) is distinct from p_revision then raise exception 'Review changed' using errcode='PT409';end if;
 next_revision:=coalesce(current_revision,0)+1;
 insert into public.connected_bill_reviews(bill_id,user_id,home_id,revision,review)
 values(b.id,b.user_id,b.home_id,next_revision,p_review)
 on conflict(bill_id) do update set revision=excluded.revision,review=excluded.review,updated_at=now();
 return next_revision;
end $$;
revoke all on function public.save_rezlee_connected_bill_review(uuid,timestamptz,integer,jsonb) from public,anon;
grant execute on function public.save_rezlee_connected_bill_review(uuid,timestamptz,integer,jsonb) to authenticated;
