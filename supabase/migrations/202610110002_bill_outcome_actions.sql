-- Customer follow-ups must survive replacement of imported provider metadata.
create table public.bill_outcome_actions (
 bill_id uuid primary key references public.bills(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 home_id uuid not null references public.homes(id) on delete cascade,
 revision integer not null default 1 check (revision > 0),
 target jsonb not null check (jsonb_typeof(target) = 'object' and octet_length(target::text) <= 16000),
 baseline_snapshot jsonb not null check (jsonb_typeof(baseline_snapshot)='object' and octet_length(baseline_snapshot::text)<=12000),
 previous_baseline jsonb check (previous_baseline is null or octet_length(previous_baseline::text)<=14000),
 updated_at timestamptz not null default now()
);
create index bill_outcome_actions_owner on public.bill_outcome_actions(user_id,home_id);
alter table public.bill_outcome_actions enable row level security;
create policy bill_outcome_owner on public.bill_outcome_actions for all to authenticated
 using (user_id=auth.uid() and exists(select 1 from public.bills b where b.id=bill_id and b.user_id=auth.uid() and b.home_id=bill_outcome_actions.home_id))
 with check (user_id=auth.uid() and exists(select 1 from public.bills b where b.id=bill_id and b.user_id=auth.uid() and b.home_id=bill_outcome_actions.home_id));
grant select,insert,update,delete on public.bill_outcome_actions to authenticated;
grant all on public.bill_outcome_actions to service_role;

create function public.save_rezlee_bill_outcome(
 p_bill_id uuid, p_bill_version timestamptz, p_revision integer,
 p_target jsonb, p_baseline jsonb, p_previous jsonb
) returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare b public.bills%rowtype; current_revision integer; next_revision integer;
begin
 select * into b from public.bills where id=p_bill_id and user_id=auth.uid() for update;
 if not found then raise exception 'Statement unavailable' using errcode='42501'; end if;
 if b.updated_at is distinct from p_bill_version then raise exception 'Statement changed' using errcode='40001'; end if;
 select revision into current_revision from public.bill_outcome_actions where bill_id=p_bill_id;
 if coalesce(current_revision,0) <> p_revision then raise exception 'Action changed' using errcode='40001'; end if;
 next_revision := coalesce(current_revision,0)+1;
 insert into public.bill_outcome_actions(bill_id,user_id,home_id,revision,target,baseline_snapshot,previous_baseline)
 values(b.id,b.user_id,b.home_id,next_revision,p_target,p_baseline,p_previous)
 on conflict(bill_id) do update set revision=excluded.revision,target=excluded.target,
 baseline_snapshot=excluded.baseline_snapshot,previous_baseline=excluded.previous_baseline,updated_at=now();
 return next_revision;
end $$;
revoke all on function public.save_rezlee_bill_outcome(uuid,timestamptz,integer,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.save_rezlee_bill_outcome(uuid,timestamptz,integer,jsonb,jsonb,jsonb) to authenticated;
