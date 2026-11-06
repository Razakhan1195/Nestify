-- Confirm membership from authenticated server state, not URL or editable profile metadata.
-- Existing rows remain intact. Pending invitations expire seven days after issuance.
create or replace function public.get_rezlee_household_invite(member_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare member public.household_members%rowtype; result_state text; home_name text; inviter_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select hm.* into member from public.household_members hm
  where hm.id=member_id and lower(coalesce(hm.email,''))=lower(coalesce(auth.jwt()->>'email',''))
    and coalesce(auth.jwt()->>'email','') <> ''
    and (hm.linked_user_id is null or hm.linked_user_id=auth.uid()) and hm.role='member';
  if not found then return jsonb_build_object('state','unavailable'); end if;
  if member.status='active' and member.linked_user_id=auth.uid() then result_state:='active';
  elsif member.status <> 'invited' then return jsonb_build_object('state','unavailable');
  elsif coalesce(member.invite_sent_at,member.created_at) <= now()-interval '7 days' then result_state:='expired';
  elsif exists(select 1 from public.homes h where h.user_id=auth.uid() and h.id<>member.home_id)
     or exists(select 1 from public.household_members hm where hm.linked_user_id=auth.uid() and hm.status='active' and hm.home_id<>member.home_id) then result_state:='other_household';
  else result_state:='pending'; end if;
  select h.nickname,coalesce(nullif(trim(p.full_name),''),'Your household owner') into home_name,inviter_name
    from public.homes h left join public.profiles p on p.user_id=h.user_id where h.id=member.home_id;
  return jsonb_build_object('state',result_state,'memberId',member.id,'homeId',member.home_id,
    'homeName',home_name,'inviterName',inviter_name,'email',member.email,
    'expiresAt',coalesce(member.invite_sent_at,member.created_at)+interval '7 days');
end;
$$;
revoke all on function public.get_rezlee_household_invite(uuid) from public,anon;
grant execute on function public.get_rezlee_household_invite(uuid) to authenticated;

create or replace function public.accept_household_invite(member_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare member public.household_members%rowtype; context jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  -- Serialize different invitations accepted by the same person as well as retries.
  perform pg_advisory_xact_lock(hashtextextended('rezlee-household-invite:'||auth.uid()::text,0));
  select hm.* into member from public.household_members hm where hm.id=member_id for update;
  context:=public.get_rezlee_household_invite(member_id);
  if context->>'state'='active' then
    return jsonb_build_object('accepted',true,'alreadyAccepted',true,'home_id',member.home_id,'member_id',member.id);
  end if;
  if context->>'state' is distinct from 'pending' then
    raise exception 'Invitation is unavailable, expired, or another household is already active' using errcode='42501';
  end if;
  update public.household_members set linked_user_id=auth.uid(),status='active',accepted_at=now(),updated_at=now() where id=member.id;
  return jsonb_build_object('accepted',true,'alreadyAccepted',false,'home_id',member.home_id,'member_id',member.id);
end;
$$;
revoke all on function public.accept_household_invite(uuid) from public,anon;
grant execute on function public.accept_household_invite(uuid) to authenticated;
notify pgrst, 'reload schema';
