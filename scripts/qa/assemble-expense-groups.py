import pathlib,re
r=pathlib.Path('/Users/razakhan/Documents/rezlee-mobile-test');o=r/'docs/checkpoints/expense-groups-20261021'
prefix=(o/'schema-prefix.sql').read_text();suffix=(o/'schema-suffix.sql').read_text()
source=(r/'supabase/migrations/202609260004_shared_expenses.sql').read_text()
balance=source[source.index('create function public.rezlee_expense_balances'):source.index('create function public.rezlee_mutate_shared_expense')]
balance=balance.replace('rezlee_expense_balances','rezlee_group_expense_balances').replace('target_home','target_group').replace('shared_expense_entries','expense_group_entries').replace('home_id','group_id')
start=balance.index(' with allowed as (');end=balance.index(' ), flows as (',start)
balance=balance[:start]+" with allowed as (select g.id from public.expense_groups g where g.id=target_group and public.rezlee_can_read_expense_group(g.id)"+balance[end:]
body=(r/'supabase/migrations/202609260005_shared_expense_conflicts.sql').read_text()
body=body[body.index('create or replace function'):body.index("notify pgrst")]
for a,b in [('create or replace function','create function'),('rezlee_mutate_shared_expense','rezlee_mutate_group_expense'),('rezlee_expense_people','rezlee_group_expense_people'),('rezlee_expense_balances','rezlee_group_expense_balances'),('shared_expense_entries','expense_group_entries'),('shared_expense_requests','expense_group_requests'),('shared_expense_changes','expense_group_changes'),('shared_expense_people','expense_group_people'),('target_home','target_group'),('home_id','group_id'),('Household','Group'),('household','group')]:body=body.replace(a,b)
start=body.index(' select h.user_id into owner_id');end=body.index(' if request_key is null',start)
body=body[:start]+""" perform pg_advisory_xact_lock(hashtextextended('rezlee-expense-group:'||target_group::text,0));
 if not public.rezlee_can_read_expense_group(target_group) then raise exception using errcode='42501',message='Group access required';end if;
 owner_id:=public.rezlee_expense_group_owner(target_group);
"""+body[end:]
s=" people:=public.rezlee_group_expense_people(target_group);"
body=body.replace(s,""" if exists(select 1 from public.expense_groups where id=target_group and archived) then raise exception using errcode='PT409',message='Restore this group before making changes';end if;
 if command?'sourceBillId' then raise exception using errcode='22023',message='Add the shared amount without attaching private bill data';end if;
"""+s)
body=body.replace("or jsonb_array_length(people)>=40","or jsonb_array_length(people)>=200 or (select count(*) from jsonb_array_elements(people) v where v->>'state'<>'former')>=40")
body=body.replace("insert into public.expense_group_people(group_id,name,is_guest) values(target_group,trim(command->>'name'),true)","insert into public.expense_group_people(group_id,name,state) values(target_group,trim(command->>'name'),'local')")
start=body.index("  update public.expense_group_people set archived=true");end=body.index("  result:=jsonb_build_object('ok',true);",start)
body=body[:start]+"""  update public.expense_group_people set state='former',invite_email=null,invite_code=null,invite_expires_at=null
   where group_id=target_group and id=(command->>'id')::uuid and linked_user_id is distinct from owner_id;
  if not found then raise exception using errcode='22023',message='Choose another participant';end if;
"""+body[end:]
start=body.index('    insert into public.expense_group_people(group_id,id,name,member_id)');end=body.index('   end loop;',start)
body=body[:start]+body[end:]
needle="    if outstanding is null or amount>outstanding then"
body=body.replace(needle,"""    if command?'expectedBalanceCents' and (jsonb_typeof(command->'expectedBalanceCents') is distinct from 'number'
     or coalesce(command->>'expectedBalanceCents','') !~ '^[0-9]+$'
     or (command->>'expectedBalanceCents')::numeric is distinct from outstanding::numeric) then
      raise exception using errcode='PT409',message='The balance changed. Refresh before recording repayment';end if;
"""+needle)
assert not any(x in body for x in ['public.homes','group_members','is_guest','member_id','set archived'])
functions=[
'rezlee_can_read_expense_group(uuid)','rezlee_expense_group_owner(uuid)','rezlee_expense_group_deleted_account()',
'rezlee_group_expense_people(uuid)','rezlee_group_expense_balances(uuid)','rezlee_mutate_group_expense(uuid,text,jsonb)',
'rezlee_create_expense_group(text,text)','rezlee_list_expense_groups()','rezlee_manage_expense_group(uuid,text,jsonb)',
'rezlee_accept_expense_group_invite(uuid)','rezlee_read_expense_group(uuid,uuid,uuid)']
revokes='\n'.join('revoke all on function public.'+f+' from public,anon,authenticated;' for f in functions)
grants='\n'.join('grant execute on function public.'+f+' to authenticated;' for f in functions if f not in ['rezlee_expense_group_owner(uuid)','rezlee_expense_group_deleted_account()'])
text='begin;\n'+prefix+'\n'+balance+'\n'+body+'\n'+suffix+'\n'+revokes+'\n'+grants+"\ngrant select on public.expense_groups,public.expense_group_entries,public.expense_group_changes,public.expense_group_requests to authenticated;\nnotify pgrst,'reload schema';\ncommit;\n"
p=r/'supabase/migrations/202610210010_independent_expense_groups.sql'
assert not p.exists()
p.write_text(text)
print('Wrote additive migration',p.name,len(text.splitlines()),'lines; historical files unchanged')
