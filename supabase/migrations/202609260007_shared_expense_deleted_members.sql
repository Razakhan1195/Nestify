-- Deleting a member account revokes access while retaining shared ledger history.
create or replace function public.rezlee_expense_people(target_home uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with allowed as (
 select h.* from public.homes h where h.id=target_home and auth.uid() is not null
 and (h.user_id=auth.uid() or public.is_active_household_member(h.id))
 ), current_people as (
 select h.user_id as id, coalesce(nullif(trim(p.full_name),''),'Household owner') as name,
 'owner'::text as state, h.user_id=auth.uid() as self, false as guest
 from allowed h left join public.profiles p on p.user_id=h.user_id
 union all
 select m.id,m.display_name,case when m.status='active' and m.linked_user_id is null then 'former' when m.status='invited' then 'invited' when m.status='local' then 'local' else 'member' end,
 m.linked_user_id=auth.uid() and m.status='active', false
 from public.household_members m join allowed h on h.id=m.home_id where m.role<>'owner'
 union all
 select p.id,p.name,case when p.archived then 'former' else 'local' end,false,true
 from public.shared_expense_people p join allowed h on h.id=p.home_id where p.is_guest
 ), all_people as (
 select * from current_people
 union all
 select p.id,p.name,'former',false,false from public.shared_expense_people p join allowed h on h.id=p.home_id
 where not p.is_guest and not exists(select 1 from current_people c where c.id=p.id)
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'state',state,'self',coalesce(self,false),'guest',guest) order by state='owner' desc,lower(name),id),'[]'::jsonb) from all_people
$$;

notify pgrst,'reload schema';
