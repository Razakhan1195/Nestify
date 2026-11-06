begin;
alter table public.notification_preferences add column shared_expenses boolean not null default true;
alter table public.notifications drop constraint notifications_category_check;
alter table public.notifications add constraint notifications_category_check check(category in ('connections','bills','care','recalls','shared_expenses'));

-- Only active, joined participants have a notification destination. Stable expense IDs
-- may refer to an invited guest later linked to a household member.
create function public.rezlee_expense_recipient(h uuid,p uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select user_id from public.homes where id=h and user_id=p
 union
 select m.linked_user_id from public.household_members m
 left join public.shared_expense_people s on s.home_id=m.home_id and s.member_id=m.id and s.is_guest
 where m.home_id=h and coalesce(s.id,m.id)=p and m.status='active' and m.linked_user_id is not null
 limit 1
$$;
revoke all on function public.rezlee_expense_recipient(uuid,uuid) from public,anon,authenticated;

create function public.rezlee_settlement_notice() returns trigger
language plpgsql security definer set search_path='' as $$
declare e public.shared_expense_entries%rowtype; person uuid; recipient uuid; amount text;
begin
 select * into e from public.shared_expense_entries where id=new.entry_id;
 if e.kind<>'repayment' then return new; end if;
 amount:='$'||to_char((e.details->>'amountCents')::numeric/100,'FM999999990.00')||' CAD';
 -- Removal resolves the original notice rather than leaving a stale success alert.
 if new.action='removed' then
  update public.notifications set resolved_at=now(),status='read',delivery_status=case when delivery_status='pending' then 'suppressed' else delivery_status end
  where related_table='shared_expense_entries' and related_id=e.id and resolved_at is null;
 end if;
 foreach person in array array[(e.details->>'from')::uuid,(e.details->>'to')::uuid] loop
  recipient:=public.rezlee_expense_recipient(e.home_id,person);
  if recipient is not null and recipient is distinct from new.actor_id then
   insert into public.notifications(user_id,home_id,notification_type,title,body,href,related_table,related_id,metadata,category,event_key,expires_at,delivery_status)
   values(recipient,e.home_id,'shared_repayment',case when new.action='removed' then 'Recorded payment removed' else 'Payment recorded' end,
    new.actor_name||case when new.action='removed' then ' removed a recorded payment of ' else ' recorded a payment of ' end||amount||'. Open to review your shared balance.',
    '/app/bills','shared_expense_entries',e.id,jsonb_build_object('mobileHref','/shared/'||e.id),'shared_expenses','shared:'||e.id||':'||new.version,now()+interval '30 days','pending')
   on conflict(user_id,event_key) where event_key is not null do nothing;
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.rezlee_settlement_notice() from public,anon,authenticated;
create trigger shared_settlement_notice after insert on public.shared_expense_changes for each row execute function public.rezlee_settlement_notice();

-- Explicit, creditor-initiated reminder. No invite or message to unjoined people.
-- One reminder for this pair per rolling 24h; retry returns the existing outcome.
create function public.rezlee_remind_shared_balance(target_home uuid,debtor uuid,creditor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare recipient uuid; amount bigint; person_name text; previous timestamptz; people jsonb;
begin
 if auth.uid() is null or public.rezlee_expense_recipient(target_home,creditor) is distinct from auth.uid()
 then raise exception using errcode='42501',message='Only remind someone who owes you'; end if;
 perform pg_advisory_xact_lock(hashtextextended('rezlee-shared-expenses:'||target_home::text,0));
 recipient:=public.rezlee_expense_recipient(target_home,debtor);
 if recipient is null or recipient=auth.uid() then raise exception using errcode='22023',message='This person has not joined'; end if;
 select (v->>'cents')::bigint into amount from jsonb_array_elements(public.rezlee_expense_balances(target_home)) v where v->>'from'=debtor::text and v->>'to'=creditor::text;
 if amount is null or amount<=0 then raise exception using errcode='PT409',message='This balance has changed'; end if;
 select created_at into previous from public.notifications where user_id=recipient and home_id=target_home and notification_type='shared_reminder'
 and metadata->>'from'=debtor::text and metadata->>'to'=creditor::text and created_at>now()-interval '24 hours' order by created_at desc limit 1;
 if previous is not null then return jsonb_build_object('ok',true,'alreadySent',true); end if;
 people:=public.rezlee_expense_people(target_home);
 select v->>'name' into person_name from jsonb_array_elements(people) v where v->>'id'=creditor::text;
 insert into public.notifications(user_id,home_id,notification_type,title,body,href,metadata,category,event_key,expires_at,delivery_status)
 values(recipient,target_home,'shared_reminder','Shared balance reminder',person_name||' sent a reminder about your shared balance. Open Rezlee to review it.',
 '/app/bills',jsonb_build_object('mobileHref','/shared','from',debtor,'to',creditor,'amountCents',amount),'shared_expenses',
 'shared-reminder:'||target_home||':'||debtor||':'||creditor||':'||gen_random_uuid(),now()+interval '7 days','pending');
 return jsonb_build_object('ok',true,'alreadySent',false);
end $$;
revoke all on function public.rezlee_remind_shared_balance(uuid,uuid,uuid) from public,anon;
grant execute on function public.rezlee_remind_shared_balance(uuid,uuid,uuid) to authenticated;

-- Resolve lost-access notices and stale balance reminders before display/delivery.
create function public.refresh_rezlee_settlement_notices(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.notifications n set resolved_at=now(),status='read',delivery_status=case when delivery_status='pending' then 'suppressed' else delivery_status end
 where n.user_id=p_user and n.category='shared_expenses' and n.resolved_at is null and (
 n.expires_at<=now() or not exists(select 1 from public.homes h where h.id=n.home_id and (h.user_id=p_user or exists(select 1 from public.household_members m where m.home_id=h.id and m.linked_user_id=p_user and m.status='active')))
 or (n.notification_type='shared_reminder' and exists(select 1 from public.shared_expense_entries e where e.home_id=n.home_id and e.updated_at>n.created_at))
 );
end $$;
revoke all on function public.refresh_rezlee_settlement_notices(uuid) from public,anon,authenticated;
grant execute on function public.refresh_rezlee_settlement_notices(uuid) to service_role;
-- Add an optimistic balance check for modern clients without replacing the existing
-- ledger transaction. Idempotent recovery is checked before comparing the balance.
create function public.rezlee_record_shared_repayment(target_home uuid,request_key text,command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_amount bigint;
begin
 if auth.uid() is null or not exists(select 1 from public.homes h where h.id=target_home and (h.user_id=auth.uid() or public.is_active_household_member(h.id)))
 then raise exception using errcode='42501',message='Household access required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('rezlee-shared-expenses:'||target_home::text,0));
 if exists(select 1 from public.shared_expense_requests where home_id=target_home and user_id=auth.uid() and request_id=request_key)
 then return public.rezlee_mutate_shared_expense(target_home,request_key,command); end if;
 if command->>'operation'<>'create' or command->>'kind'<>'repayment' or coalesce(command->>'expectedBalanceCents','') !~ '^[0-9]+$'
 then raise exception using errcode='22023',message='Check the payment'; end if;
 select (v->>'cents')::bigint into current_amount from jsonb_array_elements(public.rezlee_expense_balances(target_home)) v
 where v->>'from'=command->'details'->>'from' and v->>'to'=command->'details'->>'to';
 if current_amount is null or current_amount<>(command->>'expectedBalanceCents')::bigint then raise exception using errcode='PT409',message='The balance changed. Check recorded payments before continuing'; end if;
 return public.rezlee_mutate_shared_expense(target_home,request_key,command);
end $$;
revoke all on function public.rezlee_record_shared_repayment(uuid,text,jsonb) from public,anon;
grant execute on function public.rezlee_record_shared_repayment(uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
