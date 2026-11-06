-- Private operations tracking; customer feedback/status permissions are unchanged.
create table public.customer_feedback_followup (
 feedback_id uuid primary key references public.customer_feedback(id) on delete cascade,
 owner_name text not null default 'Raza' check(length(owner_name) between 1 and 120),
 decision text not null default '' check(length(decision)<=3000),
 response_channel text not null default '' check(response_channel in ('','email','in_app','phone','other')),
 responded_at timestamptz,
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null,
 check(responded_at is null or (length(trim(decision))>0 and response_channel<>''))
);
create table public.customer_feedback_followup_events (
 id bigint generated always as identity primary key,
 feedback_id uuid not null references public.customer_feedback(id) on delete cascade,
 operator_id uuid references auth.users(id) on delete set null,
 revision integer not null, created_at timestamptz not null default now(),
 details jsonb not null
);
alter table public.customer_feedback_followup enable row level security;
alter table public.customer_feedback_followup_events enable row level security;
revoke all on public.customer_feedback_followup,public.customer_feedback_followup_events from public,anon,authenticated;
grant select on public.customer_feedback_followup,public.customer_feedback_followup_events to service_role;
create function public.record_rezlee_feedback_followup(p_id uuid,p_operator uuid,p_revision integer,p_owner text,p_decision text,p_channel text,p_responded timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare prior public.customer_feedback_followup%rowtype; next_revision integer;
begin
 perform 1 from public.customer_feedback where id=p_id for update;
 if not found then return false;end if;
 select * into prior from public.customer_feedback_followup where feedback_id=p_id;
 if coalesce(prior.revision,0)<>p_revision then return false;end if;
 if p_operator is null or p_owner is null or length(trim(p_owner)) not between 1 and 120
 or p_decision is null or length(p_decision)>3000 or p_channel is null or p_channel not in ('','email','in_app','phone','other')
 or (p_responded is not null and (p_responded>now() or length(trim(p_decision))=0 or p_channel=''))
 then raise exception 'Check follow-up details' using errcode='22023';end if;
 next_revision:=p_revision+1;
 insert into public.customer_feedback_followup(feedback_id,owner_name,decision,response_channel,responded_at,revision,updated_by)
 values(p_id,trim(p_owner),trim(p_decision),p_channel,p_responded,next_revision,p_operator)
 on conflict(feedback_id) do update set owner_name=excluded.owner_name,decision=excluded.decision,response_channel=excluded.response_channel,
 responded_at=excluded.responded_at,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 insert into public.customer_feedback_followup_events(feedback_id,operator_id,revision,details)
 values(p_id,p_operator,next_revision,jsonb_build_object('owner',trim(p_owner),'decision',trim(p_decision),'channel',p_channel,'respondedAt',p_responded));
 return true;
end $$;
revoke all on function public.record_rezlee_feedback_followup(uuid,uuid,integer,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.record_rezlee_feedback_followup(uuid,uuid,integer,text,text,text,timestamptz) to service_role;
notify pgrst,'reload schema';
