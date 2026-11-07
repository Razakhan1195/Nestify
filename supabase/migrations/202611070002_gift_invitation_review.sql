create table public.rezlee_gift_invitation_events (
 id bigint generated always as identity primary key,
 invitation_id uuid not null references public.rezlee_gift_invitations(id) on delete cascade,
 operator_id uuid references auth.users(id) on delete set null,
 action text not null check(action='revoked'),
 reason text not null check(length(trim(reason)) between 8 and 500),
 created_at timestamptz not null default now()
);
alter table public.rezlee_gift_invitation_events enable row level security;
revoke all on public.rezlee_gift_invitation_events from public,anon,authenticated;
grant select on public.rezlee_gift_invitation_events to service_role;
create function public.rezlee_revoke_gift_invitation(p_actor uuid,p_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.rezlee_gift_invitations%rowtype;
begin
 if p_actor is null or p_reason is null or length(trim(p_reason)) not between 8 and 500 then raise exception 'Record the reason' using errcode='22023';end if;
 select * into i from public.rezlee_gift_invitations where id=p_id for update;
 if not found then raise exception 'Invitation unavailable' using errcode='PT404';end if;
 if i.claimed_at is not null then raise exception 'Gift already claimed; review the gift receipt' using errcode='PT409';end if;
 if i.revoked_at is not null then return jsonb_build_object('id',i.id,'revokedAt',i.revoked_at);end if;
 update public.rezlee_gift_invitations set revoked_at=clock_timestamp() where id=p_id returning * into i;
 insert into public.rezlee_gift_invitation_events(invitation_id,operator_id,action,reason) values(p_id,p_actor,'revoked',trim(p_reason));
 return jsonb_build_object('id',i.id,'revokedAt',i.revoked_at);
end $$;
revoke all on function public.rezlee_revoke_gift_invitation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.rezlee_revoke_gift_invitation(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
