-- Private customer feedback, bounded and idempotent; no messages are sent.
create table public.customer_feedback (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('problem','idea','other')),
 message text not null check(length(message) between 10 and 3000),
 status text not null default 'new' check(status in ('new','reviewing','planned','resolved','closed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index customer_feedback_owner on public.customer_feedback(user_id,created_at desc);
create index customer_feedback_queue on public.customer_feedback(status,created_at,id);
alter table public.customer_feedback enable row level security;
create policy feedback_owner_read on public.customer_feedback for select to authenticated using (user_id=auth.uid() and public.rezlee_account_active(auth.uid()));
revoke all on public.customer_feedback from anon,authenticated;
grant select on public.customer_feedback to authenticated;
grant select,insert,update,delete on public.customer_feedback to service_role;
create table public.customer_feedback_events (
 id bigint generated always as identity primary key,
 feedback_id uuid not null references public.customer_feedback(id) on delete cascade,
 operator_id uuid references auth.users(id) on delete set null,
 old_status text not null, new_status text not null, created_at timestamptz not null default now()
);
alter table public.customer_feedback_events enable row level security;
revoke all on public.customer_feedback_events from anon,authenticated;
grant select on public.customer_feedback_events to service_role;
create function public.submit_rezlee_feedback(p_id uuid,p_kind text,p_message text)
returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); prior public.customer_feedback%rowtype;
begin
 if u is null or not public.rezlee_account_active(u) then raise exception 'Sign in required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,927));
 select * into prior from public.customer_feedback where id=p_id;
 if found then
  if prior.user_id=u and prior.kind=p_kind and prior.message=trim(p_message) then return prior.id; end if;
  raise exception 'Submission changed' using errcode='22023';
 end if;
 if (select count(*) from public.customer_feedback where user_id=u and created_at>now()-interval '24 hours')>=5 then
  raise exception 'Daily feedback limit' using errcode='P0001'; end if;
 if p_kind not in ('problem','idea','other') or length(trim(p_message)) not between 10 and 3000 then raise exception 'Check feedback' using errcode='22023'; end if;
 insert into public.customer_feedback(id,user_id,kind,message) values(p_id,u,p_kind,trim(p_message));return p_id;
end $$;
revoke all on function public.submit_rezlee_feedback(uuid,text,text) from public,anon;
grant execute on function public.submit_rezlee_feedback(uuid,text,text) to authenticated;
create function public.review_rezlee_feedback(p_id uuid,p_operator uuid,p_status text,p_version timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare prior public.customer_feedback%rowtype;
begin
 select * into prior from public.customer_feedback where id=p_id for update;
 if not found or prior.updated_at<>p_version then return false; end if;
 if p_status not in ('new','reviewing','planned','resolved','closed') then raise exception 'Invalid status' using errcode='22023';end if;
 if prior.status=p_status then return true;end if;
 update public.customer_feedback set status=p_status,updated_at=clock_timestamp() where id=p_id;
 insert into public.customer_feedback_events(feedback_id,operator_id,old_status,new_status) values(p_id,p_operator,prior.status,p_status);
 return true;
end $$;
revoke all on function public.review_rezlee_feedback(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.review_rezlee_feedback(uuid,uuid,text,timestamptz) to service_role;
notify pgrst,'reload schema';
