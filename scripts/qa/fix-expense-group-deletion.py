from pathlib import Path
r=Path('/Users/razakhan/Documents/rezlee-mobile-test')
p=r/'supabase/migrations/202610210010_independent_expense_groups.sql'
s=p.read_text()
def replace(old,new):
 global s
 assert old in s,old[:120]
 s=s.replace(old,new)
replace(" linked_user_id uuid references auth.users(id) on delete set null,\n state text", " linked_user_id uuid references auth.users(id) on delete set null,\n was_linked boolean not null default false,\n state text")
replace("select auth.uid() is not null and exists(", "select auth.uid() is not null and public.rezlee_account_active(auth.uid()) and exists(")
replace("'id',p.id,'name',p.name,'state',case when p.state='active' and p.linked_user_id is null then 'former'", "'id',p.id,'name',case when p.linked_user_id is not null and not public.rezlee_account_active(p.linked_user_id) then 'Former member' else p.name end,\n 'state',case when p.state='active' and (p.linked_user_id is null or not public.rezlee_account_active(p.linked_user_id)) then 'former'")
replace("insert into public.expense_group_people(group_id,name,linked_user_id,state) values(new_id,coalesce(person_name,'Group owner'),auth.uid(),'active');", "insert into public.expense_group_people(group_id,name,linked_user_id,state,was_linked) values(new_id,coalesce(person_name,'Group owner'),auth.uid(),'active',true);")
replace("from jsonb_array_elements(public.rezlee_group_expense_balances(g.id)) v) totals\n", "from jsonb_array_elements(public.rezlee_group_expense_balances(g.id)) v) totals\n where public.rezlee_account_active(auth.uid())\n")
# Mutations follow the existing account freeze lock order, then the group lock.
for name in ['rezlee_create_expense_group','rezlee_mutate_group_expense','rezlee_manage_expense_group','rezlee_accept_expense_group_invite']:
 start=s.index('create function public.'+name+'(')
 end=s.index('end if;',s.index('if auth.uid() is null then',start))+len('end if;')
 s=s[:end]+"\n perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,742));\n if not public.rezlee_account_active(auth.uid()) then raise exception using errcode='42501',message='Account is being deleted';end if;"+s[end:]
start=s.index('create function public.rezlee_preview_expense_group_invite(')
end=s.index('end if;',s.index('if auth.uid() is null then',start))+len('end if;')
s=s[:end]+"\n if not public.rezlee_account_active(auth.uid()) then raise exception using errcode='42501',message='Account is being deleted';end if;"+s[end:]
replace("where group_id=target_group and id=(command->>'personId')::uuid for update;", "where group_id=target_group and id=(command->>'personId')::uuid;")
replace("if person.state='active' or (person.state='invited' and person.invite_expires_at>now()) then", "if person.was_linked and (person.linked_user_id is null or not public.rezlee_account_active(person.linked_user_id)) then raise exception using errcode='22023',message='Add a new participant for a deleted account';end if;\n   if person.state='active' or (person.state='invited' and person.invite_expires_at>now()) then")
replace("if person.state<>'active' or person.linked_user_id is null then", "if person.state<>'active' or person.linked_user_id is null or not public.rezlee_account_active(person.linked_user_id) then")
replace("set state='active',linked_user_id=auth.uid() where group_id", "set state='active',linked_user_id=auth.uid(),was_linked=true where group_id")
# Membership changes can make a previously full group exceed the limit: enforce on invitation too.
replace("code:=gen_random_uuid();\n   update public.expense_group_people", "if person.state='former' and (select count(*) from public.expense_group_people p where p.group_id=target_group and p.state<>'former')>=40 then raise exception using errcode='22023',message='This group already has 40 current participants';end if;\n   code:=gen_random_uuid();\n   update public.expense_group_people")
start=s.index('create function public.rezlee_remove_unowned_expense_group()')
end=s.index('create function public.rezlee_anonymize_group_change()',start)
s=s[:start]+"""-- Run before Auth deletion, using the same group lock as membership mutations.
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
""" +s[end:]
replace("revoke all on function public.rezlee_remove_unowned_expense_group(),public.rezlee_anonymize_group_change()", "revoke all on function public.rezlee_anonymize_group_change()")
p.write_text(s)
# Key invitation state to the account/code/attempt, so old previews never appear during replacement requests.
p=r/'apps/mobile/app/shared/join.tsx';s=p.read_text()
s=s.replace('[preview,setPreview]=useState<GroupInvitation|null>(null)', '[previewResult,setPreviewResult]=useState<{key:string;value:GroupInvitation|null;error:string|null}|null>(null)')
s=s.replace('[loading,setLoading]=useState(true)', '[initializing,setInitializing]=useState(true)')
needle=' useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);'
s=s.replace(needle,''' const previewKey=selected&&userId?userId+":"+selected+":"+attempt:null;
 const preview=previewResult?.key===previewKey?previewResult?.value:null;
 const invitationError=previewResult?.key===previewKey?previewResult?.error:null;
 const loading=initializing||Boolean(previewKey&&previewResult?.key!==previewKey);
'''+needle)
s=s.replace('setLoading(false)','setInitializing(false)')
a=s.index(' useEffect(()=>{if(!selected||!userId)return;')
b=s.index(' async function review()',a)
s=s[:a]+''' useEffect(()=>{if(!selected||!userId||!previewKey)return;let active=true;
 void fetchGroupInvitation(selected,userId)
  .then(value=>{if(active)setPreviewResult({key:previewKey,value,error:null});})
  .catch(e=>{if(active)setPreviewResult({key:previewKey,value:null,error:e instanceof ApiError?e.message:"Could not check the invitation. Try again."});});
 return()=>{active=false;};},[selected,userId,previewKey]);
'''+s[b:]
s=s.replace('setSelected(code);setAttempt', 'setError(null);setSelected(code);setAttempt')
s=s.replace('setPreview(null);setSelected(null);','setPreviewResult(null);setSelected(null);setError(null);')
s=s.replace('{error?<SharedNotice message={error}', '{error||invitationError?<SharedNotice message={error??invitationError!}')
p.write_text(s)
p=r/'apps/mobile/src/components/SharedExpenseUI.tsx';s=p.read_text().replace('useCallback,useRef,useState','useCallback,useEffect,useRef,useState')
s=s.replace('const version=useRef(0),account=useRef(userId);account.current=userId;','const version=useRef(0),account=useRef(userId);\n useEffect(()=>{account.current=userId;},[userId]);')
p.write_text(s)
for f in ['edit','repay']:
 p=r/('apps/mobile/app/shared/'+f+'.tsx');s=p.read_text()
 s=s.replace('},[saved,existing,router]);','},[saved,existing,router,data]);').replace('},[saved,router]);','},[saved,router,data]);')
 p.write_text(s)
# Extend the existing financial/privacy test with the actual supported deletion workflow.
p=r/'tests/independent-expense-groups.test.ts';s=p.read_text()
old='  await db.exec("reset role;delete from auth.users where id=\'"+owner+"\'");'
assert old in s
s=s.replace(old,'''  await db.exec("reset role;select public.begin_rezlee_account_deletion('"+owner+"',gen_random_uuid(),'"+'a'.repeat(64)+"')");
  await login();
  assert.equal(await call("rezlee_has_expense_groups",[],[]),false);
  assert.deepEqual(await call("rezlee_list_expense_groups",[],[]),[]);
  await assert.rejects(read(),{code:"42501"});
  await assert.rejects(create("Late group"),{code:"42501"});
  await assert.rejects(manage({operation:"rename",name:"Late rename"}),{code:"42501"});
  await assert.rejects(mutate({operation:"add_person",name:"Late participant"}),{code:"42501"});
  assert.equal((await db.query("select * from expense_group_requests")).rows.length,0);
  await db.exec("reset role;update public.account_deletion_jobs set phase='account' where user_id='"+owner+"';select public.clean_rezlee_account_links('"+owner+"');select public.clean_rezlee_account_links('"+owner+"');delete from auth.users where id='"+owner+"'");
''')
s=s.replace('  await manage({operation:"rename",name:"Retained history"});','''  await manage({operation:"rename",name:"Retained history"});
  await assert.rejects(manage({operation:"invite",personId:self,email:"other@example.invalid"}),{code:"22023"});
  const audit=await read(g,entry);
  assert.ok(audit.changes.every(c=>(c as {actor_name:string}).actor_name==="Former member"));
''')
p.write_text(s)
print('Updated deletion integration, participant identity preservation and keyed invitation state.')
