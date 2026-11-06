-- Expected review conflicts must not use PostgreSQL serialization failures.
-- PostgREST can retry 40001 indefinitely; PT409 returns a bounded conflict.
create or replace function public.choose_rezlee_bill_record(p_first uuid,p_second uuid,p_first_fingerprint text,p_second_fingerprint text,p_selected uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); a public.bills%rowtype; b public.bills%rowtype; first_id uuid;second_id uuid; losing uuid; f text; s text;
begin
 if u is null or not public.rezlee_account_active(u) then raise exception 'Sign in required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,742));
 select * into a from public.bills where id=p_first and user_id=u for update;
 select * into b from public.bills where id=p_second and user_id=u for update;
 if a.id is null or b.id is null or a.id=b.id or a.home_id<>b.home_id then raise exception 'Statements unavailable' using errcode='42501';end if;
 if public.rezlee_bill_fingerprint(a) is distinct from p_first_fingerprint or public.rezlee_bill_fingerprint(b) is distinct from p_second_fingerprint then raise exception 'Statements changed' using errcode='PT409';end if;
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
  then raise exception 'Review the existing choice first' using errcode='PT409';end if;
 end if;
 insert into public.bill_record_choices(user_id,home_id,first_bill_id,second_bill_id,selected_bill_id,first_fingerprint,second_fingerprint)
 values(u,a.home_id,first_id,second_id,p_selected,f,s)
 on conflict(first_bill_id,second_bill_id) do update set selected_bill_id=excluded.selected_bill_id,first_fingerprint=excluded.first_fingerprint,second_fingerprint=excluded.second_fingerprint,updated_at=now();
 return jsonb_build_object('ok',true,'selectedBillId',p_selected);
end $$;
notify pgrst,'reload schema';
