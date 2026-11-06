-- Batch request identity and RLS-enforced home resolution without sharing
-- authorization between requests. No caller-supplied user/home identifiers.
create function public.rezlee_mobile_read_bootstrap(p_snapshot boolean default false,p_effective boolean default true)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare context jsonb; uid uuid; home_row record; member_row record;
 access_row jsonb:=null; snapshot jsonb:=null;
begin
 context:=public.rezlee_authenticated_mobile_context();
 if context->>'access'<>'active' then
  return context||jsonb_build_object('homeAccess',null,'homeSnapshot',null);
 end if;
 uid:=auth.uid();
 select id,nickname,user_id into home_row from public.homes
  where user_id=uid order by created_at asc limit 1;
 if found then
  access_row:=jsonb_build_object('home',to_jsonb(home_row),'role','owner','memberId',null);
 else
  select id,home_id into member_row from public.household_members
   where linked_user_id=uid and status='active' order by created_at asc limit 1;
  if found then
   select id,nickname,user_id into home_row from public.homes where id=member_row.home_id;
   if found then access_row:=jsonb_build_object('home',to_jsonb(home_row),'role','member','memberId',member_row.id);end if;
  end if;
 end if;
 if p_snapshot and access_row is not null then
  snapshot:=public.rezlee_home_snapshot((access_row->'home'->>'id')::uuid,p_effective);
 end if;
 return context||jsonb_build_object('homeAccess',access_row,'homeSnapshot',snapshot);
end $$;
revoke all on function public.rezlee_mobile_read_bootstrap(boolean,boolean) from public,anon;
grant execute on function public.rezlee_mobile_read_bootstrap(boolean,boolean) to authenticated;
notify pgrst,'reload schema';
