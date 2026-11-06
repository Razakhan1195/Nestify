-- A stale bill/action is a business conflict: return HTTP 409 and require reload.
-- Do not signal a retryable database serialization failure.
create or replace function public.save_rezlee_bill_outcome(
 p_bill_id uuid, p_bill_version timestamptz, p_revision integer,
 p_target jsonb, p_baseline jsonb, p_previous jsonb
) returns integer language plpgsql security invoker set search_path=public,pg_temp as $$
declare b public.bills%rowtype; current_revision integer; next_revision integer;
begin
 select * into b from public.bills where id=p_bill_id and user_id=auth.uid() for update;
 if not found then raise exception 'Statement unavailable' using errcode='42501'; end if;
 if b.updated_at is distinct from p_bill_version then raise exception 'Statement changed' using errcode='PT409'; end if;
 select revision into current_revision from public.bill_outcome_actions where bill_id=p_bill_id;
 if coalesce(current_revision,0) <> p_revision then raise exception 'Action changed' using errcode='PT409'; end if;
 next_revision := coalesce(current_revision,0)+1;
 insert into public.bill_outcome_actions(bill_id,user_id,home_id,revision,target,baseline_snapshot,previous_baseline)
 values(b.id,b.user_id,b.home_id,next_revision,p_target,p_baseline,p_previous)
 on conflict(bill_id) do update set revision=excluded.revision,target=excluded.target,
 baseline_snapshot=excluded.baseline_snapshot,previous_baseline=excluded.previous_baseline,updated_at=now();
 return next_revision;
end $$;
