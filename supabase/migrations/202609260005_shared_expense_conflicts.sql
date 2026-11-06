-- Business conflicts must not use SQLSTATE 40001: PostgREST can retry it indefinitely.
-- PT409 returns a non-retryable domain conflict, preserving the original transaction guards.
create or replace function public.rezlee_mutate_shared_expense(target_home uuid,request_key text,command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 owner_id uuid; actor_person uuid; actor_name text; people jsonb; person jsonb; person_id uuid;
 op text; entry public.shared_expense_entries%rowtype; previous public.shared_expense_requests%rowtype;
 body jsonb; ids uuid[]; part jsonb; total bigint; amount bigint; outstanding bigint;
 happened date; result jsonb; new_id uuid; expected integer; current_balance jsonb;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Sign in required'; end if;
 select h.user_id into owner_id from public.homes h where h.id=target_home
 and (h.user_id=auth.uid() or public.is_active_household_member(h.id));
 if owner_id is null then raise exception using errcode='42501',message='Household access required'; end if;
 -- One household transaction at a time: repayments cannot spend the same debt twice.
 perform pg_advisory_xact_lock(hashtextextended('rezlee-shared-expenses:'||target_home::text,0));
 if request_key is null or request_key !~ '^[a-zA-Z0-9-]{8,96}$' or command is null or jsonb_typeof(command)<>'object'
 or octet_length(command::text)>16000 then raise exception using errcode='22023',message='Check the entry'; end if;
 select * into previous from public.shared_expense_requests r where r.home_id=target_home and r.user_id=auth.uid() and r.request_id=request_key;
 if found then
  if previous.payload<>command then raise exception using errcode='22023',message='This save was already used for different details'; end if;
  return previous.result;
 end if;
 people:=public.rezlee_expense_people(target_home);
 select (v->>'id')::uuid,v->>'name' into actor_person,actor_name from jsonb_array_elements(people) v where (v->>'self')::boolean limit 1;
 op:=command->>'operation';
 if op='add_person' then
  if owner_id<>auth.uid() then raise exception using errcode='42501',message='Only the household owner can add a person'; end if;
  if jsonb_typeof(command->'name') is distinct from 'string' or char_length(trim(command->>'name')) not between 1 and 80
  or jsonb_array_length(people)>=40 then raise exception using errcode='22023',message='Check the name or household size'; end if;
  if exists(select 1 from jsonb_array_elements(people) v where lower(trim(v->>'name'))=lower(trim(command->>'name')) and v->>'state'<>'former') then
   raise exception using errcode='23505',message='A person with this name already exists';
  end if;
  insert into public.shared_expense_people(home_id,name,is_guest) values(target_home,trim(command->>'name'),true) returning id into new_id;
  result:=jsonb_build_object('ok',true,'id',new_id);
 elsif op='archive_person' then
  if owner_id<>auth.uid() then raise exception using errcode='42501',message='Only the household owner can remove a person'; end if;
  update public.shared_expense_people set archived=true where home_id=target_home and id=(command->>'id')::uuid and is_guest;
  if not found then raise exception using errcode='22023',message='Manage household members in Household'; end if;
  result:=jsonb_build_object('ok',true);
 elsif op in ('create','edit','void') then
  if op<>'create' then
   select * into entry from public.shared_expense_entries e where e.id=(command->>'id')::uuid and e.home_id=target_home for update;
   if not found then raise exception using errcode='P0002',message='Entry unavailable'; end if;
   if entry.created_by is distinct from auth.uid() and owner_id<>auth.uid() then raise exception using errcode='42501',message='Only the author or household owner can correct this entry'; end if;
   expected:=(command->>'version')::integer;
   if expected is null or expected<>entry.version or entry.voided then raise exception using errcode='PT409',message='This entry changed. Reload before continuing'; end if;
   if op='edit' and entry.kind<>'expense' then raise exception using errcode='22023',message='Remove and re-record a repayment to correct it'; end if;
  end if;
  if op='void' then
   if char_length(trim(coalesce(command->>'reason',''))) not between 1 and 240 then raise exception using errcode='22023',message='Add a short reason'; end if;
   update public.shared_expense_entries set voided=true,version=version+1,updated_at=now() where id=entry.id returning * into entry;
   insert into public.shared_expense_changes(entry_id,home_id,actor_id,actor_name,action,version,details)
    values(entry.id,target_home,auth.uid(),coalesce(actor_name,'Household member'),'removed',entry.version,
     jsonb_build_object('reason',trim(command->>'reason'),'previous',entry.details));
  else
   body:=command->'details';
   if jsonb_typeof(body) is distinct from 'object' or jsonb_typeof(body->'amountCents') is distinct from 'number'
    or coalesce(body->>'amountCents','') !~ '^[0-9]+$' then raise exception using errcode='22023',message='Enter a valid amount'; end if;
   amount:=(body->>'amountCents')::bigint;
   if amount not between 1 and 100000000 then raise exception using errcode='22023',message='Amount must be between one cent and one million CAD'; end if;
   if jsonb_typeof(body->'happenedOn') is distinct from 'string' or body->>'happenedOn' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception using errcode='22023',message='Choose the payment date'; end if;
   happened:=(body->>'happenedOn')::date;
   if happened>current_date or happened<'2000-01-01'::date then raise exception using errcode='22023',message='Use a payment date from 2000 through today'; end if;
   if jsonb_typeof(body->'note') is distinct from 'string' or char_length(body->>'note')>500 then raise exception using errcode='22023',message='Keep notes under 500 characters'; end if;
   if op='create' then entry.kind:=command->>'kind'; end if;
   if entry.kind='expense' then
    if jsonb_typeof(body->'title') is distinct from 'string' or char_length(trim(body->>'title')) not between 1 and 120
     or jsonb_typeof(body->'shares') is distinct from 'array' then raise exception using errcode='22023',message='Check the expense and shares'; end if;
    if jsonb_array_length(body->'shares') not between 1 and 40 then raise exception using errcode='22023',message='Choose who shares this expense'; end if;
    total:=0; ids:=array[]::uuid[];
    for part in select value from jsonb_array_elements(body->'shares') loop
     if jsonb_typeof(part->'cents') is distinct from 'number' or coalesce(part->>'cents','') !~ '^[0-9]+$'
       or (part->>'cents')::bigint>amount then raise exception using errcode='22023',message='Check each share'; end if;
     person_id:=(part->>'personId')::uuid;
     if person_id is null or person_id=any(ids) then raise exception using errcode='22023',message='Choose each person once'; end if;
     ids:=array_append(ids,person_id); total:=total+(part->>'cents')::bigint;
    end loop;
    if total<>amount then raise exception using errcode='22023',message='Shares must add up to the expense'; end if;
    ids:=array_append(ids,(body->>'paidBy')::uuid);
    if owner_id<>auth.uid() and not coalesce(actor_person=any(ids),false) then raise exception using errcode='42501',message='Record an expense you paid or share'; end if;
    -- Rebuild a bounded canonical record. Unrecognized fields (including private bill data) are not copied.
    body:=jsonb_build_object('title',trim(body->>'title'),'amountCents',amount,'paidBy',body->>'paidBy',
      'happenedOn',happened::text,'note',trim(body->>'note'),'shares',
      (select jsonb_agg(jsonb_build_object('personId',v->>'personId','cents',(v->>'cents')::bigint) order by v->>'personId') from jsonb_array_elements(body->'shares') v));
   elsif entry.kind='repayment' and op='create' then
    ids:=array[(body->>'from')::uuid,(body->>'to')::uuid];
    if ids[1]=ids[2] then raise exception using errcode='22023',message='Choose two different people'; end if;
    if owner_id<>auth.uid() and actor_person is distinct from ids[1] and actor_person is distinct from ids[2] then raise exception using errcode='42501',message='Record repayments you sent or received'; end if;
    current_balance:=public.rezlee_expense_balances(target_home);
    select (v->>'cents')::bigint into outstanding from jsonb_array_elements(current_balance) v where v->>'from'=body->>'from' and v->>'to'=body->>'to';
    if outstanding is null or amount>outstanding then raise exception using errcode='PT409',message='The balance changed or this exceeds the amount owed. Reload balances'; end if;
    body:=jsonb_build_object('from',body->>'from','to',body->>'to','amountCents',amount,'happenedOn',happened::text,'note',trim(body->>'note'));
   else raise exception using errcode='22023',message='Choose an expense or repayment'; end if;
   foreach person_id in array ids loop
    select v into person from jsonb_array_elements(people) v where v->>'id'=person_id::text;
    if person is null then raise exception using errcode='22023',message='A person is no longer available'; end if;
    if person->>'state'='former' and entry.kind='expense' and not (
     op='edit' and (entry.details->>'paidBy'=person_id::text or exists(select 1 from jsonb_array_elements(entry.details->'shares') s where s->>'personId'=person_id::text))
    ) then raise exception using errcode='22023',message='Choose current people for a new expense'; end if;
    insert into public.shared_expense_people(home_id,id,name,member_id)
     values(target_home,person_id,person->>'name',(select id from public.household_members where id=person_id and home_id=target_home))
     on conflict(home_id,id) do update set name=excluded.name;
   end loop;
   if op='create' then
    insert into public.shared_expense_entries(home_id,created_by,kind,details)
     values(target_home,auth.uid(),entry.kind,body) returning * into entry;
   else
    update public.shared_expense_entries set details=body,version=version+1,updated_at=now() where id=entry.id returning * into entry;
   end if;
   insert into public.shared_expense_changes(entry_id,home_id,actor_id,actor_name,action,version,details)
    values(entry.id,target_home,auth.uid(),coalesce(actor_name,'Household member'),case when op='create' then 'added' else 'corrected' end,entry.version,body);
  end if;
  result:=jsonb_build_object('ok',true,'id',entry.id,'version',entry.version);
 else raise exception using errcode='22023',message='Unknown action'; end if;
 insert into public.shared_expense_requests(home_id,user_id,request_id,payload,result) values(target_home,auth.uid(),request_key,command,result);
 return result;
end;
$$;

notify pgrst,'reload schema';
