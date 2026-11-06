-- Phone links request membership; they never authenticate or prove phone ownership.
create table public.household_phone_invites (
 member_id uuid primary key references public.household_members(id) on delete cascade,
 home_id uuid not null references public.homes(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
 phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
 request_user_id uuid references auth.users(id) on delete set null,
 request_email text,
 requested_at timestamptz,
 accepted_at timestamptz,
 expires_at timestamptz not null default now()+interval '7 days',
 unique(owner_id, request_id)
);
alter table public.household_phone_invites enable row level security;
revoke all on public.household_phone_invites from anon, authenticated;
grant select on public.household_phone_invites to authenticated;
create policy phone_invites_owner_read on public.household_phone_invites for select to authenticated using(owner_id=auth.uid());

create function public.create_rezlee_phone_invite(target_home uuid,request_key uuid,token_digest text,phone_number text,person_name text,relation text,expense_person uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.household_phone_invites%rowtype; person public.shared_expense_people%rowtype; member uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.homes where id=target_home and user_id=auth.uid()) then raise exception 'Only the household owner can invite people' using errcode='42501'; end if;
 if token_digest is null or token_digest !~ '^[a-f0-9]{64}$' or phone_number is null or phone_number !~ '^\+[1-9][0-9]{7,14}$'
 or person_name is null or char_length(trim(person_name)) not between 1 and 80 or char_length(coalesce(relation,''))>40 or request_key is null then raise exception 'Check invitation details' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('rezlee-shared-expenses:'||target_home::text,0));
 select * into saved from public.household_phone_invites where owner_id=auth.uid() and request_id=request_key;
 if found then
  if saved.home_id<>target_home or saved.token_hash<>token_digest or saved.phone<>phone_number then raise exception 'Invitation save changed' using errcode='22023';end if;
  return jsonb_build_object('memberId',saved.member_id,'expiresAt',saved.expires_at);
 end if;
 if (select count(*) from public.household_members where home_id=target_home)>=40 then raise exception 'Household member limit reached' using errcode='22023';end if;
 if exists(select 1 from public.household_phone_invites i join public.household_members m on m.id=i.member_id where i.home_id=target_home and i.phone=phone_number) then raise exception 'An invitation for this number already exists. Review People before sending another.' using errcode='PT409';end if;
 if expense_person is not null then
  select * into person from public.shared_expense_people where home_id=target_home and id=expense_person for update;
  if not found or not person.is_guest or person.archived or person.member_id is not null then raise exception 'Choose an uninvited expense participant' using errcode='PT409';end if;
  person_name:=person.name;
 end if;
 insert into public.household_members(home_id,created_by_user_id,display_name,relationship,role,status,invite_sent_at)
 values(target_home,auth.uid(),trim(person_name),nullif(relation,''),'member','invited',now()) returning id into member;
 insert into public.household_phone_invites(member_id,home_id,owner_id,request_id,token_hash,phone)
 values(member,target_home,auth.uid(),request_key,token_digest,phone_number) returning * into saved;
 if expense_person is not null then update public.shared_expense_people set member_id=member where home_id=target_home and id=expense_person;end if;
 return jsonb_build_object('memberId',member,'expiresAt',saved.expires_at);
end;
$$;

create function public.request_rezlee_phone_invite(token_digest text,confirm_join boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare invite public.household_phone_invites%rowtype; home_name text; result_state text;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'email','')='' then raise exception 'Sign in with a verified account first' using errcode='42501';end if;
 select * into invite from public.household_phone_invites where token_hash=token_digest for update;
 if not found then return jsonb_build_object('state','unavailable');end if;
 if invite.accepted_at is not null then return jsonb_build_object('state',case when invite.request_user_id=auth.uid() then 'accepted' else 'unavailable' end);end if;
 if invite.expires_at<=now() then return jsonb_build_object('state','expired');end if;
 if invite.owner_id=auth.uid() then return jsonb_build_object('state','own_household');end if;
 if invite.request_user_id is not null and invite.request_user_id<>auth.uid() then return jsonb_build_object('state','unavailable');end if;
 if exists(select 1 from public.homes where user_id=auth.uid()) or exists(select 1 from public.household_members where linked_user_id=auth.uid() and status='active') then return jsonb_build_object('state','other_household');end if;
 if confirm_join then
  update public.household_phone_invites set request_user_id=auth.uid(),request_email=auth.jwt()->>'email',requested_at=now() where member_id=invite.member_id;
 end if;
 select nickname into home_name from public.homes where id=invite.home_id;
 result_state:=case when confirm_join or invite.request_user_id=auth.uid() then 'awaiting_approval' else 'pending' end;
 return jsonb_build_object('state',result_state,'homeName',home_name,'expiresAt',invite.expires_at);
end;
$$;

create function public.approve_rezlee_phone_invite(target_member uuid,expected_user uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare invite public.household_phone_invites%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 select * into invite from public.household_phone_invites where member_id=target_member and owner_id=auth.uid() for update;
 if not found or expected_user is null or invite.request_user_id is distinct from expected_user then raise exception 'Request unavailable' using errcode='42501';end if;
 if invite.accepted_at is not null then return jsonb_build_object('ok',true);end if;
 if invite.expires_at<=now() then raise exception 'Invitation expired. Send a fresh invitation.' using errcode='PT409';end if;
 perform pg_advisory_xact_lock(hashtextextended('rezlee-household-invite:'||expected_user::text,0));
 if exists(select 1 from public.homes where user_id=expected_user) or exists(select 1 from public.household_members where linked_user_id=expected_user and status='active') then raise exception 'This person already belongs to a household' using errcode='PT409';end if;
 update public.household_members set linked_user_id=expected_user,email=invite.request_email,status='active',accepted_at=now(),updated_at=now() where id=target_member and home_id=invite.home_id and status='invited';
 if not found then raise exception 'Invitation no longer available' using errcode='PT409';end if;
 update public.household_phone_invites set accepted_at=now() where member_id=target_member;
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.create_rezlee_phone_invite(uuid,uuid,text,text,text,text,uuid) from public,anon;
revoke all on function public.request_rezlee_phone_invite(text,boolean) from public,anon;
revoke all on function public.approve_rezlee_phone_invite(uuid,uuid) from public,anon;
grant execute on function public.create_rezlee_phone_invite(uuid,uuid,text,text,text,text,uuid) to authenticated;
grant execute on function public.request_rezlee_phone_invite(text,boolean) to authenticated;
grant execute on function public.approve_rezlee_phone_invite(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
