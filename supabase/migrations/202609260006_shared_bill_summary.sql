-- A private link prevents accidentally sharing the same saved bill twice.
-- Ledger members see only the explicitly reviewed summary, never the original bill.
create table public.shared_expense_bill_links (
 home_id uuid not null references public.homes(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 bill_id uuid references public.bills(id) on delete set null,
 entry_id uuid not null references public.shared_expense_entries(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(entry_id),
 unique(user_id,bill_id)
);
alter table public.shared_expense_bill_links enable row level security;
create policy shared_bill_link_private on public.shared_expense_bill_links for select to authenticated using (
 user_id=auth.uid() and exists(select 1 from public.homes h where h.id=home_id and h.user_id=auth.uid()));
grant select on public.shared_expense_bill_links to authenticated;

create function public.rezlee_share_bill_expense(target_home uuid,request_key text,source_bill uuid,command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; existing uuid; previous jsonb;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Sign in required'; end if;
 if not exists(select 1 from public.homes h where h.id=target_home and h.user_id=auth.uid())
 then raise exception using errcode='42501',message='Use a bill you own'; end if;
 if command->>'operation' is distinct from 'create' or command->>'kind' is distinct from 'expense'
 then raise exception using errcode='22023',message='Create a reviewed shared expense'; end if;
 perform pg_advisory_xact_lock(hashtextextended('rezlee-shared-expenses:'||target_home::text,0));
 command:=command||jsonb_build_object('sourceBillId',source_bill);
 select payload into previous from public.shared_expense_requests where home_id=target_home and user_id=auth.uid() and request_id=request_key;
 if found then
  -- Core receipt verification rejects changed details and recovers the committed entry.
  return public.rezlee_mutate_shared_expense(target_home,request_key,command);
 end if;
 if not exists(select 1 from public.bills b where b.id=source_bill and b.user_id=auth.uid() and b.home_id=target_home and b.currency='CAD')
 then raise exception using errcode='42501',message='Use an available Canadian-dollar bill you own'; end if;
 select entry_id into existing from public.shared_expense_bill_links where user_id=auth.uid() and bill_id=source_bill;
 if found then raise exception using errcode='PT409',message='This bill already has a shared expense. Open it to review or correct the share'; end if;
 result:=public.rezlee_mutate_shared_expense(target_home,request_key,command);
 insert into public.shared_expense_bill_links(home_id,user_id,bill_id,entry_id)
 values(target_home,auth.uid(),source_bill,(result->>'id')::uuid);
 return result;
end;
$$;
revoke all on function public.rezlee_share_bill_expense(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.rezlee_share_bill_expense(uuid,text,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
