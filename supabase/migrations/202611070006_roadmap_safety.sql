-- Private user safety preferences and moderated reports; identities never leave RPCs.
create table public.roadmap_hidden_ideas(user_id uuid not null references auth.users(id) on delete cascade, idea_id uuid not null references public.roadmap_ideas(id) on delete cascade, primary key(user_id,idea_id));
create table public.roadmap_blocked_authors(user_id uuid not null references auth.users(id) on delete cascade, author_id uuid not null references auth.users(id) on delete cascade, primary key(user_id,author_id),check(user_id<>author_id));
create table public.roadmap_reports(user_id uuid not null references auth.users(id) on delete cascade,idea_id uuid not null references public.roadmap_ideas(id) on delete cascade,reason text not null check(reason in ('abuse','privacy','spam','other')),created_at timestamptz not null default now(),resolved_at timestamptz,primary key(user_id,idea_id));
alter table public.roadmap_hidden_ideas enable row level security;
alter table public.roadmap_blocked_authors enable row level security;
alter table public.roadmap_reports enable row level security;
revoke all on public.roadmap_hidden_ideas,public.roadmap_blocked_authors,public.roadmap_reports from public,anon,authenticated;
grant select on public.roadmap_reports to service_role;
create function public.rezlee_roadmap_safety(p_action text,p_id uuid default null,p_reason text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); idea public.roadmap_ideas%rowtype;
begin
 if u is null or not public.rezlee_account_active(u) or not public.rezlee_session_allowed() or not exists(select 1 from auth.users where id=u and email_confirmed_at is not null) then raise exception 'Sign in required' using errcode='42501';end if;
 if p_action is null or p_action not in ('hide','block','report','reset') then raise exception 'Check action' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,1138));
 if p_action='reset' then
  delete from public.roadmap_hidden_ideas where user_id=u;delete from public.roadmap_blocked_authors where user_id=u;
  return jsonb_build_object('ok',true);
 end if;
 select * into idea from public.roadmap_ideas where id=p_id and visibility='public' and (user_id is null or public.rezlee_account_active(user_id)) for share;
 if not found then raise exception 'Suggestion unavailable' using errcode='P0002';end if;
 if idea.user_id=u then raise exception 'Choose another idea' using errcode='22023';end if;
 if p_action='block' then
  if idea.user_id is null then raise exception 'This is a team idea; hide it instead' using errcode='22023';end if;
  insert into public.roadmap_blocked_authors values(u,idea.user_id) on conflict do nothing;
 end if;
 if p_action='report' then
  if p_reason is null or p_reason not in ('abuse','privacy','spam','other') then raise exception 'Choose a reason' using errcode='22023';end if;
  if not exists(select 1 from public.roadmap_reports where user_id=u and idea_id=p_id) and (select count(*) from public.roadmap_reports where user_id=u and created_at>now()-interval '24 hours')>=20 then raise exception 'Daily report limit' using errcode='P0001';end if;
  insert into public.roadmap_reports(user_id,idea_id,reason) values(u,p_id,p_reason) on conflict do nothing;
 end if;
 insert into public.roadmap_hidden_ideas values(u,p_id) on conflict do nothing;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.rezlee_roadmap_safety(text,uuid,text) from public,anon;
grant execute on function public.rezlee_roadmap_safety(text,uuid,text) to authenticated;
create or replace function public.rezlee_roadmap_list(p_mine boolean default false,p_status text default 'all',p_sort text default 'top',p_search text default '',p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is not null and not public.rezlee_session_allowed() then u:=null;end if;
 if p_mine and (u is null or not public.rezlee_account_active(u)) then raise exception 'Sign in required' using errcode='42501';end if;
 if p_status is null or p_status not in ('all','under_review','planned','in_progress','shipped','not_planned')
 or p_sort is null or p_sort not in ('top','newest') or p_search is null or length(p_search)>120
 or p_page is null or p_page not between 0 and 1000 then raise exception 'Check filters' using errcode='22023';end if;
 with candidates as (
  select i.*,coalesce(v.upvotes,0) upvotes,coalesce(v.downvotes,0) downvotes,coalesce(v.score,0) score,coalesce(v.my_vote,0) my_vote
  from public.roadmap_ideas i
  left join lateral (
   select count(*) filter(where value=1) upvotes,count(*) filter(where value=-1) downvotes,
    coalesce(sum(value),0) score,max(value) filter(where user_id=u) my_vote
   from public.roadmap_votes where idea_id=i.id
  ) v on true
  where (i.user_id is null or public.rezlee_account_active(i.user_id)) and (case when p_mine then i.user_id=u else i.visibility='public' end)
   and (p_mine or (not exists(select 1 from public.roadmap_hidden_ideas h where h.user_id=u and h.idea_id=i.id) and not exists(select 1 from public.roadmap_blocked_authors a where a.user_id=u and a.author_id=i.user_id)))
   and (p_status='all' or i.status=p_status)
   and (p_search='' or position(lower(p_search) in lower(i.title||' '||i.description))>0)
 ), selected as (
  select * from candidates order by case when p_sort='top' then score end desc,created_at desc,id
  limit 30 offset p_page*30
 )
 select jsonb_build_object(
  'items',coalesce((select jsonb_agg(jsonb_build_object(
   'id',id,'title',title,'description',description,'category',category,'visibility',visibility,
   'status',status,'priority',priority,'response',response,'decidedAt',decided_at,
   'createdAt',created_at,'updatedAt',updated_at,'responseDueAt',created_at+interval '7 days',
   'upvotes',upvotes,'downvotes',downvotes,'score',score,'myVote',my_vote,'mine',coalesce(user_id=u,false),'canBlock',coalesce(user_id<>u,false)
  ) order by case when p_sort='top' then score end desc,created_at desc,id) from selected),'[]'::jsonb),
  'total',(select count(*) from candidates),'page',p_page
 ) into result;
 return result;
end $$;

create or replace function public.rezlee_roadmap_vote(p_id uuid,p_value integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null or not public.rezlee_account_active(u) or not public.rezlee_session_allowed()
 or not exists(select 1 from auth.users where id=u and email_confirmed_at is not null) then raise exception 'Sign in required' using errcode='42501';end if;
 if p_value is null or p_value not in (-1,0,1) then raise exception 'Check vote' using errcode='22023';end if;
 perform 1 from public.roadmap_ideas i where not exists(select 1 from public.roadmap_hidden_ideas h where h.user_id=u and h.idea_id=i.id) and not exists(select 1 from public.roadmap_blocked_authors a where a.user_id=u and a.author_id=i.user_id) and id=p_id and visibility='public' and (user_id is null or public.rezlee_account_active(user_id)) for update;
 if not found then raise exception 'Suggestion unavailable' using errcode='P0002';end if;
 if p_value=0 then delete from public.roadmap_votes where idea_id=p_id and user_id=u;
 else insert into public.roadmap_votes(idea_id,user_id,value) values(p_id,u,p_value)
 on conflict(idea_id,user_id) do update set value=excluded.value,updated_at=clock_timestamp();end if;
 select jsonb_build_object('id',p_id,'myVote',p_value,'upvotes',count(*) filter(where value=1),
 'downvotes',count(*) filter(where value=-1),'score',coalesce(sum(value),0))
 into result from public.roadmap_votes where idea_id=p_id;
 return result;
end $$;
notify pgrst, 'reload schema';
create or replace function public.rezlee_roadmap_review(p_id uuid,p_operator uuid,p_revision integer,p_visibility text,p_status text,p_priority text,p_response text)
returns boolean language plpgsql security definer set search_path='' as $$
declare prior public.roadmap_ideas%rowtype;
begin
 select * into prior from public.roadmap_ideas where id=p_id for update;
 if not found or prior.revision<>p_revision then return false;end if;
 if p_operator is null or p_visibility is null or p_visibility not in ('pending','public','hidden')
 or p_status is null or p_status not in ('under_review','planned','in_progress','shipped','not_planned')
 or p_priority is null or p_priority not in ('none','next','later')
 or p_response is null or length(p_response)>2000
 or (p_status<>'under_review' and length(trim(p_response))<10)
 or (p_status='planned' and p_priority='none')
 or (p_visibility='hidden' and length(trim(p_response))<10)
 then raise exception 'Add a clear decision and response' using errcode='22023';end if;
 update public.roadmap_ideas set visibility=p_visibility,status=p_status,priority=case when p_status='planned' then p_priority else 'none' end,response=trim(p_response),
 decided_at=case when p_status<>'under_review' then coalesce(decided_at,clock_timestamp()) else decided_at end,
 updated_at=clock_timestamp(),revision=revision+1 where id=p_id;
 insert into public.roadmap_review_events(idea_id,operator_id,revision,details)
 values(p_id,p_operator,p_revision+1,jsonb_build_object('visibility',p_visibility,'status',p_status,'priority',p_priority,'response',trim(p_response)));
 update public.roadmap_reports set resolved_at=clock_timestamp() where idea_id=p_id and resolved_at is null;
 return true;
end $$;

notify pgrst,'reload schema';

create trigger guard_deleting_account before insert or update on public.roadmap_hidden_ideas for each row execute function public.guard_deleting_rezlee_account();
create trigger guard_deleting_account before insert or update on public.roadmap_blocked_authors for each row execute function public.guard_deleting_rezlee_account();
create trigger guard_deleting_account before insert or update on public.roadmap_reports for each row execute function public.guard_deleting_rezlee_account();
