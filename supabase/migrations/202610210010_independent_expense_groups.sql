begin;
-- Independent expense groups. No household membership, home or private-record permission is created.
create table public.expense_groups (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid references auth.users(id) on delete set null,
 name text not null check(char_length(trim(name)) between 1 and 80),
 archived boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.expense_group_people (
 group_id uuid not null references public.expense_groups(id) on delete cascade,
 id uuid not null default gen_random_uuid(),
 name text not null check(char_length(trim(name)) between 1 and 80),
 linked_user_id uuid references auth.users(id) on delete set null,
 was_linked boolean not null default false,
 state text not null check(state in ('local','invited','active','former')),
 invite_email text, invite_code uuid unique, invite_expires_at timestamptz,
 created_at timestamptz not null default now(),
 primary key(group_id,id)
);
create unique index expense_group_active_user on public.expense_group_people(group_id,linked_user_id) where state='active' and linked_user_id is not null;
create unique index expense_group_invite_email on public.expense_group_people(group_id,lower(invite_email)) where state in ('invited','active') and invite_email is not null;
create index expense_group_user_lookup on public.expense_group_people(linked_user_id,group_id) where state='active';
create table public.expense_group_entries (
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references public.expense_groups(id) on delete cascade,
 created_by uuid references auth.users(id) on delete set null,
 kind text not null check(kind in ('expense','repayment')), details jsonb not null,
 version integer not null default 1, voided boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index expense_group_entries_page on public.expense_group_entries(group_id,created_at desc,id desc);
create table public.expense_group_changes (
 id bigint generated always as identity primary key,
 entry_id uuid not null references public.expense_group_entries(id) on delete cascade,
 group_id uuid not null references public.expense_groups(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null, actor_name text not null,
 action text not null, version integer not null, details jsonb not null,
 created_at timestamptz not null default now(), unique(entry_id,version)
);
create table public.expense_group_requests (
 group_id uuid not null references public.expense_groups(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id text not null, payload jsonb not null, result jsonb not null,
 created_at timestamptz not null default now(), primary key(group_id,user_id,request_id)
);
create table public.expense_group_create_requests (
 user_id uuid not null references auth.users(id) on delete cascade, request_id text not null,
 name text not null, group_id uuid not null references public.expense_groups(id) on delete cascade,
 primary key(user_id,request_id)
);
alter table public.expense_groups enable row level security;
alter table public.expense_group_people enable row level security;
alter table public.expense_group_entries enable row level security;
alter table public.expense_group_changes enable row level security;
alter table public.expense_group_requests enable row level security;
alter table public.expense_group_create_requests enable row level security;

create function public.rezlee_can_read_expense_group(target_group uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.rezlee_account_active(auth.uid()) and exists(
 select 1 from public.expense_group_people p where p.group_id=target_group and p.linked_user_id=auth.uid() and p.state='active')
$$;
-- If an owner deletes their account, an existing active participant becomes the effective owner.
-- This never invites anyone, exposes private home data or deletes another person's ledger.
create function public.rezlee_expense_group_owner(target_group uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select coalesce(g.owner_id,(select p.linked_user_id from public.expense_group_people p
 where p.group_id=g.id and p.state='active' and p.linked_user_id is not null order by p.created_at,p.id limit 1))
 from public.expense_groups g where g.id=target_group
$$;
create function public.rezlee_expense_group_deleted_account() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.linked_user_id is not null and new.linked_user_id is null then
  new.state:='former'; new.name:='Former member'; new.invite_email:=null; new.invite_code:=null; new.invite_expires_at:=null;
 end if;
 return new;
end $$;
create trigger expense_group_deleted_account before update of linked_user_id on public.expense_group_people
 for each row execute function public.rezlee_expense_group_deleted_account();

create policy expense_group_read on public.expense_groups for select to authenticated using(public.rezlee_can_read_expense_group(id));
create policy expense_group_entries_read on public.expense_group_entries for select to authenticated using(public.rezlee_can_read_expense_group(group_id));
create policy expense_group_changes_read on public.expense_group_changes for select to authenticated using(public.rezlee_can_read_expense_group(group_id));
create policy expense_group_requests_read on public.expense_group_requests for select to authenticated using(user_id=auth.uid() and public.rezlee_can_read_expense_group(group_id));
-- People/invitation rows are private; bounded RPCs return only the public group fields.

create function public.rezlee_group_expense_people(target_group uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
 'id',p.id,'name',case when p.linked_user_id is not null and not public.rezlee_account_active(p.linked_user_id) then 'Former member' else p.name end,
 'state',case when p.state='active' and (p.linked_user_id is null or not public.rezlee_account_active(p.linked_user_id)) then 'former'
 when p.state='active' and p.linked_user_id=public.rezlee_expense_group_owner(target_group) then 'owner'
 when p.state='active' then 'member' else p.state end,
 'self',coalesce(p.linked_user_id=auth.uid() and p.state='active',false),
 'guest',p.state in ('local','invited'),
 'inviteExpired',p.state='invited' and p.invite_expires_at<now()
 ) order by p.linked_user_id=public.rezlee_expense_group_owner(target_group) desc nulls last,p.created_at,p.id),'[]'::jsonb)
 from public.expense_group_people p where p.group_id=target_group and public.rezlee_can_read_expense_group(target_group)
$$;

create function public.rezlee_create_expense_group(request_key text,group_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous public.expense_group_create_requests%rowtype; new_id uuid; person_name text;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Sign in required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,742));
 if not public.rezlee_account_active(auth.uid()) then raise exception using errcode='42501',message='Account is being deleted';end if;
 if request_key is null or request_key !~ '^[a-zA-Z0-9-]{8,96}$' or group_name is null
 or char_length(trim(group_name)) not between 1 and 80 then raise exception using errcode='22023',message='Choose a group name';end if;
 perform pg_advisory_xact_lock(hashtextextended('rezlee-expense-group-create:'||auth.uid()::text,0));
 select * into previous from public.expense_group_create_requests where user_id=auth.uid() and request_id=request_key;
 if found then
  if previous.name<>trim(group_name) then raise exception using errcode='PT409',message='This save has different details';end if;
  return jsonb_build_object('ok',true,'groupId',previous.group_id);
 end if;
 if (select count(*) from public.expense_groups g where g.owner_id=auth.uid() and not g.archived)>=20 then
  raise exception using errcode='PT409',message='Archive a settled group before creating another';end if;
 insert into public.expense_groups(owner_id,name) values(auth.uid(),trim(group_name)) returning id into new_id;
 select coalesce(nullif(trim(full_name),''),'Group owner') into person_name from public.profiles where user_id=auth.uid();
 insert into public.expense_group_people(group_id,name,linked_user_id,state,was_linked) values(new_id,coalesce(person_name,'Group owner'),auth.uid(),'active',true);
 insert into public.expense_group_create_requests values(auth.uid(),request_key,trim(group_name),new_id);
 return jsonb_build_object('ok',true,'groupId',new_id);
end $$;

create function public.rezlee_group_expense_balances(target_group uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with allowed as (select g.id from public.expense_groups g where g.id=target_group and public.rezlee_can_read_expense_group(g.id) ), flows as (
 select (s->>'personId')::uuid debtor,(e.details->>'paidBy')::uuid creditor,(s->>'cents')::bigint amount
 from public.expense_group_entries e join allowed h on h.id=e.group_id,
 lateral jsonb_array_elements(case when e.kind='expense' then e.details->'shares' else '[]'::jsonb end) s
 where not e.voided and e.kind='expense' and s->>'personId'<>e.details->>'paidBy'
 union all
 select (e.details->>'from')::uuid,(e.details->>'to')::uuid,-(e.details->>'amountCents')::bigint
 from public.expense_group_entries e join allowed h on h.id=e.group_id where not e.voided and e.kind='repayment'
 ), pairs as (
 select least(debtor,creditor) a,greatest(debtor,creditor) b,
 sum(case when debtor<creditor then amount else -amount end) balance from flows group by 1,2
 )
 select coalesce(jsonb_agg(jsonb_build_object('from',case when balance>0 then a else b end,
 'to',case when balance>0 then b else a end,'cents',abs(balance)) order by a,b) filter(where balance<>0),'[]'::jsonb) from pairs
$$;


create function public.rezlee_list_expense_groups() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'archived',g.archived,
 'role',case when public.rezlee_expense_group_owner(g.id)=auth.uid() then 'owner' else 'member' end,
 'peopleCount',(select count(*) from public.expense_group_people p where p.group_id=g.id and p.state<>'former'),
 'currency','CAD','youOweCents',totals.owe,'youAreOwedCents',totals.owed) order by g.archived,g.created_at desc),'[]'::jsonb)
 from public.expense_groups g join public.expense_group_people me on me.group_id=g.id and me.linked_user_id=auth.uid() and me.state='active'
 cross join lateral (select coalesce(sum((v->>'cents')::bigint) filter(where v->>'from'=me.id::text),0) owe,
 coalesce(sum((v->>'cents')::bigint) filter(where v->>'to'=me.id::text),0) owed
 from jsonb_array_elements(public.rezlee_group_expense_balances(g.id)) v) totals
 where public.rezlee_account_active(auth.uid())
$$;

create function public.rezlee_mutate_group_expense(target_group uuid,request_key text,command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 owner_id uuid; actor_person uuid; actor_name text; people jsonb; person jsonb; person_id uuid;
 op text; entry public.expense_group_entries%rowtype; previous public.expense_group_requests%rowtype;
 body jsonb; ids uuid[]; part jsonb; total bigint; amount bigint; outstanding bigint;
 happened date; result jsonb; new_id uuid; expected integer; current_balance jsonb;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Sign in required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,742));
 if not public.rezlee_account_active(auth.uid()) then raise exception using errcode='42501',message='Account is being deleted';end if;
 perform pg_advisory_xact_lock(hashtextextended('rezlee-expense-group:'||target_group::text,0));
 if not public.rezlee_can_read_expense_group(target_group) then raise exception using errcode='42501',message='Group access required';end if;
 owner_id:=public.rezlee_expense_group_owner(target_group);
 if request_key is null or request_key !~ '^[a-zA-Z0-9-]{8,96}$' or command is null or jsonb_typeof(command)<>'object'
 or octet_length(command::text)>16000 then raise exception using errcode='22023',message='Check the entry'; end if;
 select * into previous from public.expense_group_requests r where r.group_id=target_group and r.user_id=auth.uid() and r.request_id=request_key;
 if found then
  if previous.payload<>command then raise exception using errcode='22023',message='This save was already used for different details'; end if;
  return previous.result;
 end if;
 if exists(select 1 from public.expense_groups where id=target_group and archived) then raise exception using errcode='PT409',message='Restore this group before making changes';end if;
 if command?'sourceBillId' then raise exception using errcode='22023',message='Add the shared amount without attaching private bill data';end if;
 people:=public.rezlee_group_expense_people(target_group);
 select (v->>'id')::uuid,v->>'name' into actor_person,actor_name from jsonb_array_elements(people) v where (v->>'self')::boolean limit 1;
 op:=command->>'operation';
 if op='add_person' then
  if owner_id<>auth.uid() then raise exception using errcode='42501',message='Only the group owner can add a person'; end if;
  if jsonb_typeof(command->'name') is distinct from 'string' or char_length(trim(command->>'name')) not between 1 and 80
  or jsonb_array_length(people)>=200 or (select count(*) from jsonb_array_elements(people) v where v->>'state'<>'former')>=40 then raise exception using errcode='22023',message='Check the name or group size'; end if;
  if exists(select 1 from jsonb_array_elements(people) v where lower(trim(v->>'name'))=lower(trim(command->>'name')) and v->>'state'<>'former') then
   raise exception using errcode='23505',message='A person with this name already exists';
  end if;
  insert into public.expense_group_people(group_id,name,state) values(target_group,trim(command->>'name'),'local') returning id into new_id;
  result:=jsonb_build_object('ok',true,'id',new_id);
 elsif op='archive_person' then
  if owner_id<>auth.uid() then raise exception using errcode='42501',message='Only the group owner can remove a person'; end if;
  update public.expense_group_people set state='former',invite_email=null,invite_code=null,invite_expires_at=null
   where group_id=target_group and id=(command->>'id')::uuid and linked_user_id is distinct from owner_id;
  if not found then raise exception using errcode='22023',message='Choose another participant';end if;
  result:=jsonb_build_object('ok',true);
 elsif op in ('create','edit','void') then
  if op<>'create' then
   select * into entry from public.expense_group_entries e where e.id=(command->>'id')::uuid and e.group_id=target_group for update;
   if not found then raise exception using errcode='P0002',message='Entry unavailable'; end if;
   if entry.created_by is distinct from auth.uid() and owner_id<>auth.uid() then raise exception using errcode='42501',message='Only the author or group owner can correct this entry'; end if;
   expected:=(command->>'version')::integer;
   if expected is null or expected<>entry.version or entry.voided then raise exception using errcode='PT409',message='This entry changed. Reload before continuing'; end if;
   if op='edit' and entry.kind<>'expense' then raise exception using errcode='22023',message='Remove and re-record a repayment to correct it'; end if;
  end if;
  if op='void' then
   if char_length(trim(coalesce(command->>'reason',''))) not between 1 and 240 then raise exception using errcode='22023',message='Add a short reason'; end if;
   update public.expense_group_entries set voided=true,version=version+1,updated_at=now() where id=entry.id returning * into entry;
   insert into public.expense_group_changes(entry_id,group_id,actor_id,actor_name,action,version,details)
    values(entry.id,target_group,auth.uid(),coalesce(actor_name,'Group member'),'removed',entry.version,
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
    current_balance:=public.rezlee_group_expense_balances(target_group);
    select (v->>'cents')::bigint into outstanding from jsonb_array_elements(current_balance) v where v->>'from'=body->>'from' and v->>'to'=body->>'to';
    if command?'expectedBalanceCents' and (jsonb_typeof(command->'expectedBalanceCents') is distinct from 'number'
     or coalesce(command->>'expectedBalanceCents','') !~ '^[0-9]+$'
     or (command->>'expectedBalanceCents')::numeric is distinct from outstanding::numeric) then
      raise exception using errcode='PT409',message='The balance changed. Refresh before recording repayment';end if;
    if outstanding is null or amount>outstanding then raise exception using errcode='PT409',message='The balance changed or this exceeds the amount owed. Reload balances'; end if;
    body:=jsonb_build_object('from',body->>'from','to',body->>'to','amountCents',amount,'happenedOn',happened::text,'note',trim(body->>'note'));
   else raise exception using errcode='22023',message='Choose an expense or repayment'; end if;
   foreach person_id in array ids loop
    select v into person from jsonb_array_elements(people) v where v->>'id'=person_id::text;
    if person is null then raise exception using errcode='22023',message='A person is no longer available'; end if;
    if person->>'state'='former' and entry.kind='expense' and not (
     op='edit' and (entry.details->>'paidBy'=person_id::text or exists(select 1 from jsonb_array_elements(entry.details->'shares') s where s->>'personId'=person_id::text))
    ) then raise exception using errcode='22023',message='Choose current people for a new expense'; end if;
   end loop;
   if op='create' then
    insert into public.expense_group_entries(group_id,created_by,kind,details)
     values(target_group,auth.uid(),entry.kind,body) returning * into entry;
   else
    update public.expense_group_entries set details=body,version=version+1,updated_at=now() where id=entry.id returning * into entry;
   end if;
   insert into public.expense_group_changes(entry_id,group_id,actor_id,actor_name,action,version,details)
    values(entry.id,target_group,auth.uid(),coalesce(actor_name,'Group member'),case when op='create' then 'added' else 'corrected' end,entry.version,body);
  end if;
  result:=jsonb_build_object('ok',true,'id',entry.id,'version',entry.version);
 else raise exception using errcode='22023',message='Unknown action'; end if;
 insert into public.expense_group_requests(group_id,user_id,request_id,payload,result) values(target_group,auth.uid(),request_key,command,result);
 return result;
end;
$$;


create function public.rezlee_manage_expense_group(target_group uuid,request_key text,command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; previous public.expense_group_requests%rowtype; op text; person public.expense_group_people%rowtype;
 result jsonb; code uuid; mail text; is_archived boolean; actor uuid;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Sign in required';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,742));
 if not public.rezlee_account_active(auth.uid()) then raise exception using errcode='42501',message='Account is being deleted';end if;
 perform pg_advisory_xact_lock(hashtextextended('rezlee-expense-group:'||target_group::text,0));
 if not public.rezlee_can_read_expense_group(target_group) then raise exception using errcode='42501',message='Group access required';end if;
 owner_id:=public.rezlee_expense_group_owner(target_group);
 if request_key is null or request_key !~ '^[a-zA-Z0-9-]{8,96}$' or command is null
 or jsonb_typeof(command)<>'object' or octet_length(command::text)>16000 then raise exception using errcode='22023',message='Check the group change';end if;
 select * into previous from public.expense_group_requests where group_id=target_group and user_id=auth.uid() and request_id=request_key;
 if found then
  if previous.payload<>command then raise exception using errcode='PT409',message='This save has different details';end if;
  return previous.result;
 end if;
 op:=command->>'operation';
 if op<>'leave' and owner_id<>auth.uid() then raise exception using errcode='42501',message='Only the group owner can manage this group';end if;
 select archived into is_archived from public.expense_groups where id=target_group;
 if is_archived and op not in ('restore','leave','transfer_owner','rename') then raise exception using errcode='PT409',message='Restore this group before making changes';end if;
 result:=jsonb_build_object('ok',true,'groupId',target_group);
 if op='rename' then
  if jsonb_typeof(command->'name') is distinct from 'string' or char_length(trim(command->>'name')) not between 1 and 80 then raise exception using errcode='22023',message='Choose a group name';end if;
  update public.expense_groups set name=trim(command->>'name') where id=target_group;
 elsif op='archive' then
  if jsonb_array_length(public.rezlee_group_expense_balances(target_group))<>0 then raise exception using errcode='PT409',message='Settle outstanding balances before archiving';end if;
  update public.expense_groups set archived=true where id=target_group;
 elsif op='restore' then
  if (select count(*) from public.expense_groups g where g.owner_id=auth.uid() and not g.archived)>=20 then raise exception using errcode='PT409',message='Archive a settled group before restoring another';end if;
  update public.expense_groups set archived=false where id=target_group;
 elsif op in ('invite','share_invite','cancel_invite','remove_member','transfer_owner') then
  select * into person from public.expense_group_people where group_id=target_group and id=(command->>'personId')::uuid;
  if not found then raise exception using errcode='P0002',message='Person unavailable';end if;
  if person.linked_user_id=owner_id then raise exception using errcode='22023',message='Transfer group ownership before leaving';end if;
  if op='invite' then
   mail:=lower(trim(command->>'email'));
   if mail is null or char_length(mail)>254 or mail !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception using errcode='22023',message='Enter their account email';end if;
   if person.was_linked and (person.linked_user_id is null or not public.rezlee_account_active(person.linked_user_id)) then raise exception using errcode='22023',message='Add a new participant for a deleted account';end if;
   if person.state='active' or (person.state='invited' and person.invite_expires_at>now()) then raise exception using errcode='PT409',message='This person already joined or has a current invitation';end if;
   if exists(select 1 from auth.users where id=auth.uid() and lower(email)=mail) then raise exception using errcode='22023',message='You already belong to this group';end if;
   if person.linked_user_id is not null and not exists(select 1 from auth.users where id=person.linked_user_id and lower(email)=mail) then
    raise exception using errcode='22023',message='Use the same account for this existing participant';end if;
   if exists(select 1 from public.expense_group_people p left join auth.users u on u.id=p.linked_user_id
    where p.group_id=target_group and p.id<>person.id and (p.state='active' and lower(u.email)=mail or p.state='invited' and lower(p.invite_email)=mail)) then
    raise exception using errcode='PT409',message='This account already joined or was invited';end if;
   if person.state='former' and (select count(*) from public.expense_group_people p where p.group_id=target_group and p.state<>'former')>=40 then raise exception using errcode='22023',message='This group already has 40 current participants';end if;
   code:=gen_random_uuid();
   update public.expense_group_people set state='invited',invite_email=mail,invite_code=code,invite_expires_at=now()+interval '7 days' where group_id=target_group and id=person.id;
   result:=result||jsonb_build_object('inviteCode',code,'expiresAt',now()+interval '7 days');
  elsif op='share_invite' then
   if person.state<>'invited' or person.invite_expires_at<=now() or person.invite_code is null then raise exception using errcode='PT409',message='This invitation expired or was cancelled';end if;
   result:=result||jsonb_build_object('inviteCode',person.invite_code,'expiresAt',person.invite_expires_at);
  elsif op='cancel_invite' then
   if person.state<>'invited' then raise exception using errcode='PT409',message='This invitation changed';end if;
   update public.expense_group_people set state=case when linked_user_id is null then 'local' else 'former' end,invite_email=null,invite_code=null,invite_expires_at=null where group_id=target_group and id=person.id;
  elsif op='remove_member' then
   update public.expense_group_people set state='former',invite_email=null,invite_code=null,invite_expires_at=null where group_id=target_group and id=person.id;
  else
   if person.state<>'active' or person.linked_user_id is null or not public.rezlee_account_active(person.linked_user_id) then raise exception using errcode='22023',message='Choose someone who has joined';end if;
   update public.expense_groups set owner_id=person.linked_user_id where id=target_group;
  end if;
 elsif op='leave' then
  if owner_id=auth.uid() then raise exception using errcode='PT409',message='Transfer group ownership before leaving';end if;
  select id into actor from public.expense_group_people where group_id=target_group and linked_user_id=auth.uid() and state='active';
  update public.expense_group_people set state='former',invite_email=null,invite_code=null,invite_expires_at=null where group_id=target_group and id=actor;
 else raise exception using errcode='22023',message='Choose a group action';end if;
 insert into public.expense_group_requests(group_id,user_id,request_id,payload,result) values(target_group,auth.uid(),request_key,command,result);
 return result;
end $$;

create function public.rezlee_accept_expense_group_invite(invitation_code uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target_group uuid; person public.expense_group_people%rowtype; mail text; verified boolean;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Sign in required';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,742));
 if not public.rezlee_account_active(auth.uid()) then raise exception using errcode='42501',message='Account is being deleted';end if;
 select group_id into target_group from public.expense_group_people where invite_code=invitation_code;
 if target_group is null then raise exception using errcode='P0002',message='Invitation unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended('rezlee-expense-group:'||target_group::text,0));
 select * into person from public.expense_group_people where invite_code=invitation_code for update;
 if not found then raise exception using errcode='P0002',message='Invitation unavailable';end if;
 select lower(email),email_confirmed_at is not null into mail,verified from auth.users where id=auth.uid();
 if not coalesce(verified,false) or mail is distinct from lower(person.invite_email) then raise exception using errcode='42501',message='Use the verified account this invitation was addressed to';end if;
 if person.state='active' and person.linked_user_id=auth.uid() then return jsonb_build_object('ok',true,'groupId',target_group);end if;
 if person.state<>'invited' or person.invite_expires_at is null or person.invite_expires_at<=now() then raise exception using errcode='PT409',message='This invitation expired or was cancelled';end if;
 if exists(select 1 from public.expense_groups where id=target_group and archived) then raise exception using errcode='PT409',message='This group is archived';end if;
 if exists(select 1 from public.expense_group_people where group_id=target_group and linked_user_id=auth.uid() and state='active') then raise exception using errcode='PT409',message='You already belong to this group';end if;
 if person.linked_user_id is not null and person.linked_user_id<>auth.uid() then raise exception using errcode='42501',message='Use the same account for this existing participant';end if;
 update public.expense_group_people set state='active',linked_user_id=auth.uid(),was_linked=true where group_id=target_group and id=person.id;
 return jsonb_build_object('ok',true,'groupId',target_group);
end $$;

create function public.rezlee_read_expense_group(target_group uuid,entry_id uuid default null,before_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare g public.expense_groups%rowtype; is_owner boolean; rows jsonb; changes jsonb; cursor_time timestamptz;
begin
 if not public.rezlee_can_read_expense_group(target_group) then raise exception using errcode='42501',message='Group access required';end if;
 select * into g from public.expense_groups where id=target_group;
 is_owner:=public.rezlee_expense_group_owner(target_group)=auth.uid();
 if before_id is not null then
  select created_at into cursor_time from public.expense_group_entries where id=before_id and group_id=target_group;
  if not found then raise exception using errcode='PT409',message='Refresh group history';end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'home_id',e.group_id,'kind',e.kind,'details',e.details,
 'version',e.version,'voided',e.voided,'created_at',e.created_at,'updated_at',e.updated_at,
 'canEdit',not g.archived and not e.voided and (is_owner or e.created_by=auth.uid())) order by e.created_at desc,e.id desc),'[]'::jsonb)
 into rows from (select * from public.expense_group_entries e where e.group_id=target_group
 and (entry_id is null or e.id=entry_id) and (before_id is null or (e.created_at,e.id)<(cursor_time,before_id))
 order by created_at desc,id desc limit 41) e;
 if entry_id is not null and jsonb_array_length(rows)=0 then raise exception using errcode='P0002',message='Entry unavailable';end if;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.version desc),'[]'::jsonb) into changes from
 (select c.id,c.actor_name,c.action,c.version,c.details,c.created_at from public.expense_group_changes c
 where c.group_id=target_group and c.entry_id=rezlee_read_expense_group.entry_id order by c.version desc limit 21) c;
 return jsonb_build_object('home',jsonb_build_object('id',g.id,'name',g.name),'groupId',g.id,'archived',g.archived,
 'role',case when is_owner then 'owner' else 'member' end,'settlementNotices',false,
 'people',public.rezlee_group_expense_people(g.id),'balances',public.rezlee_group_expense_balances(g.id),
 'entries',case when jsonb_array_length(rows)>40 then rows-40 else rows end,
 'changes',case when jsonb_array_length(changes)>20 then changes-20 else changes end,'moreChanges',jsonb_array_length(changes)>20,
 'nextCursor',case when jsonb_array_length(rows)>40 then rows->39->>'id' else null end);
end $$;

create function public.rezlee_preview_expense_group_invite(invitation_code uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare person public.expense_group_people%rowtype; mail text; verified boolean; result jsonb;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='Sign in required';end if;
 if not public.rezlee_account_active(auth.uid()) then raise exception using errcode='42501',message='Account is being deleted';end if;
 select * into person from public.expense_group_people where invite_code=invitation_code;
 if not found then raise exception using errcode='P0002',message='Invitation unavailable';end if;
 select lower(email),email_confirmed_at is not null into mail,verified from auth.users where id=auth.uid();
 if not coalesce(verified,false) or mail is distinct from lower(person.invite_email) then raise exception using errcode='42501',message='Use the verified account this invitation was addressed to';end if;
 if not (person.state='active' and person.linked_user_id=auth.uid()) and (person.state<>'invited' or person.invite_expires_at<=now()) then raise exception using errcode='PT409',message='This invitation expired or was cancelled';end if;
 select jsonb_build_object('groupId',g.id,'name',g.name,'archived',g.archived,'alreadyJoined',person.state='active',
 'peopleCount',(select count(*) from public.expense_group_people p where p.group_id=g.id and p.state<>'former')) into result from public.expense_groups g where g.id=person.group_id;
 return result;
end $$;

create function public.rezlee_has_expense_groups() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.rezlee_account_active(auth.uid()) and exists(select 1 from public.expense_group_people where linked_user_id=auth.uid() and state='active')
$$;

-- Run before Auth deletion, using the same group lock as membership mutations.
-- FK triggers alone cannot safely decide whether an in-flight invitation joined.
create or replace function public.clean_rezlee_account_links(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare target_group uuid;
begin
 if not exists(select 1 from public.account_deletion_jobs where user_id=p_user and phase='account') then raise exception 'No deletion in progress';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,742));
 for target_group in select g.id from public.expense_groups g
  where g.owner_id=p_user or exists(select 1 from public.expense_group_people p where p.group_id=g.id and p.linked_user_id=p_user)
  order by g.id
 loop
  perform pg_advisory_xact_lock(hashtextextended('rezlee-expense-group:'||target_group::text,0));
  update public.expense_group_people set linked_user_id=null where group_id=target_group and linked_user_id=p_user;
  update public.expense_groups set owner_id=null where id=target_group and owner_id=p_user;
  update public.expense_group_changes set actor_id=null where group_id=target_group and actor_id=p_user;
  delete from public.expense_groups g where g.id=target_group and g.owner_id is null
   and not exists(select 1 from public.expense_group_people p where p.group_id=g.id and p.linked_user_id is not null);
 end loop;
 -- Preserve the established household/provider cleanup.
 delete from public.household_members where linked_user_id=p_user;
 delete from public.deck_events where task_run_id in
  (select deck_task_run_id from public.provider_sync_runs where user_id=p_user);
end $$;
revoke all on function public.clean_rezlee_account_links(uuid) from public,anon,authenticated;
grant execute on function public.clean_rezlee_account_links(uuid) to service_role;
create trigger guard_deleting_account before insert or update on public.expense_group_requests
 for each row execute function public.guard_deleting_rezlee_account();
create trigger guard_deleting_account before insert or update on public.expense_group_create_requests
 for each row execute function public.guard_deleting_rezlee_account();
create policy rezlee_active_accounts on public.expense_group_requests as restrictive for all to authenticated
 using(public.rezlee_account_active(auth.uid()) and public.rezlee_account_active(user_id))
 with check(public.rezlee_account_active(auth.uid()) and public.rezlee_account_active(user_id));
create policy rezlee_active_accounts on public.expense_group_create_requests as restrictive for all to authenticated
 using(public.rezlee_account_active(auth.uid()) and public.rezlee_account_active(user_id))
 with check(public.rezlee_account_active(auth.uid()) and public.rezlee_account_active(user_id));
create function public.rezlee_anonymize_group_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.actor_id is not null and new.actor_id is null then new.actor_name:='Former member';end if;
 return new;
end $$;
create trigger anonymize_group_change before update of actor_id on public.expense_group_changes
 for each row execute function public.rezlee_anonymize_group_change();

revoke all on function public.rezlee_can_read_expense_group(uuid) from public,anon,authenticated;
revoke all on function public.rezlee_expense_group_owner(uuid) from public,anon,authenticated;
revoke all on function public.rezlee_expense_group_deleted_account() from public,anon,authenticated;
revoke all on function public.rezlee_group_expense_people(uuid) from public,anon,authenticated;
revoke all on function public.rezlee_group_expense_balances(uuid) from public,anon,authenticated;
revoke all on function public.rezlee_mutate_group_expense(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.rezlee_create_expense_group(text,text) from public,anon,authenticated;
revoke all on function public.rezlee_list_expense_groups() from public,anon,authenticated;
revoke all on function public.rezlee_manage_expense_group(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.rezlee_accept_expense_group_invite(uuid) from public,anon,authenticated;
revoke all on function public.rezlee_read_expense_group(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.rezlee_can_read_expense_group(uuid) to authenticated;
grant execute on function public.rezlee_group_expense_people(uuid) to authenticated;
grant execute on function public.rezlee_group_expense_balances(uuid) to authenticated;
grant execute on function public.rezlee_mutate_group_expense(uuid,text,jsonb) to authenticated;
grant execute on function public.rezlee_create_expense_group(text,text) to authenticated;
grant execute on function public.rezlee_list_expense_groups() to authenticated;
grant execute on function public.rezlee_manage_expense_group(uuid,text,jsonb) to authenticated;
grant execute on function public.rezlee_accept_expense_group_invite(uuid) to authenticated;
grant execute on function public.rezlee_read_expense_group(uuid,uuid,uuid) to authenticated;
grant select on public.expense_groups,public.expense_group_entries,public.expense_group_changes,public.expense_group_requests to authenticated;
grant all on public.expense_groups,public.expense_group_people,public.expense_group_entries,public.expense_group_changes,public.expense_group_requests,public.expense_group_create_requests to service_role;
grant usage,select on sequence public.expense_group_changes_id_seq to service_role;
notify pgrst,'reload schema';
revoke all on function public.rezlee_preview_expense_group_invite(uuid) from public,anon;
grant execute on function public.rezlee_preview_expense_group_invite(uuid) to authenticated;
revoke all on function public.rezlee_has_expense_groups() from public,anon;
grant execute on function public.rezlee_has_expense_groups() to authenticated;
revoke all on function public.rezlee_anonymize_group_change() from public,anon,authenticated;
commit;
