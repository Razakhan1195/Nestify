-- Public roadmap is separate from private support feedback. Only reviewed,
-- explicitly shared suggestions are public; identities and votes stay private.
create table public.roadmap_ideas (
 id uuid primary key,
 user_id uuid references auth.users(id) on delete cascade,
 title text not null check(length(title) between 6 and 100),
 description text not null check(length(description) between 20 and 2000),
 category text not null check(category in ('bills','records','care','household','realtors','other')),
 visibility text not null default 'pending' check(visibility in ('pending','public','hidden')),
 status text not null default 'under_review' check(status in ('under_review','planned','in_progress','shipped','not_planned')),
 priority text not null default 'none' check(priority in ('none','next','later')),
 response text not null default '' check(length(response)<=2000),
 decided_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 revision integer not null default 1,
 check(status='under_review' or length(trim(response))>=10),
 check(status<>'planned' or priority<>'none')
);
create index roadmap_ideas_public on public.roadmap_ideas(visibility,status,created_at desc,id);
create index roadmap_ideas_owner on public.roadmap_ideas(user_id,created_at desc);
create index roadmap_ideas_due on public.roadmap_ideas(created_at,id) where decided_at is null;
create table public.roadmap_votes (
 idea_id uuid not null references public.roadmap_ideas(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 value smallint not null check(value in (-1,1)),
 updated_at timestamptz not null default now(),
 primary key(idea_id,user_id)
);
create table public.roadmap_review_events (
 id bigint generated always as identity primary key,
 idea_id uuid not null references public.roadmap_ideas(id) on delete cascade,
 operator_id uuid references auth.users(id) on delete set null,
 revision integer not null,
 details jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.roadmap_ideas enable row level security;
alter table public.roadmap_votes enable row level security;
alter table public.roadmap_review_events enable row level security;
revoke all on public.roadmap_ideas,public.roadmap_votes,public.roadmap_review_events from public,anon,authenticated;
grant select on public.roadmap_ideas,public.roadmap_votes,public.roadmap_review_events to service_role;

create function public.rezlee_roadmap_list(p_mine boolean default false,p_status text default 'all',p_sort text default 'top',p_search text default '',p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb;
begin
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
  where (case when p_mine then i.user_id=u else i.visibility='public' end)
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
   'upvotes',upvotes,'downvotes',downvotes,'score',score,'myVote',my_vote,'mine',coalesce(user_id=u,false)
  ) order by case when p_sort='top' then score end desc,created_at desc,id) from selected),'[]'::jsonb),
  'total',(select count(*) from candidates),'page',p_page
 ) into result;
 return result;
end $$;
revoke all on function public.rezlee_roadmap_list(boolean,text,text,text,integer) from public;
grant execute on function public.rezlee_roadmap_list(boolean,text,text,text,integer) to anon,authenticated;

create function public.rezlee_roadmap_submit(p_id uuid,p_title text,p_description text,p_category text,p_share_publicly boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); prior public.roadmap_ideas%rowtype;
begin
 if u is null or not public.rezlee_account_active(u) then raise exception 'Sign in required' using errcode='42501';end if;
 if p_share_publicly is distinct from true then raise exception 'Public sharing confirmation required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,1137));
 select * into prior from public.roadmap_ideas where id=p_id;
 if found then
  if prior.user_id=u and prior.title=trim(p_title) and prior.description=trim(p_description) and prior.category=p_category then return p_id;end if;
  raise exception 'Submission changed' using errcode='22023';
 end if;
 if (select count(*) from public.roadmap_ideas where user_id=u and created_at>now()-interval '24 hours')>=5 then raise exception 'Daily suggestion limit' using errcode='P0001';end if;
 if p_id is null or p_title is null or length(trim(p_title)) not between 6 and 100
 or p_description is null or length(trim(p_description)) not between 20 and 2000
 or p_category is null or p_category not in ('bills','records','care','household','realtors','other')
 then raise exception 'Check suggestion' using errcode='22023';end if;
 insert into public.roadmap_ideas(id,user_id,title,description,category) values(p_id,u,trim(p_title),trim(p_description),p_category);
 return p_id;
end $$;
revoke all on function public.rezlee_roadmap_submit(uuid,text,text,text,boolean) from public,anon;
grant execute on function public.rezlee_roadmap_submit(uuid,text,text,text,boolean) to authenticated;

-- Setting the desired vote (including zero to clear) makes retries idempotent.
create function public.rezlee_roadmap_vote(p_id uuid,p_value integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null or not public.rezlee_account_active(u) then raise exception 'Sign in required' using errcode='42501';end if;
 if p_value is null or p_value not in (-1,0,1) then raise exception 'Check vote' using errcode='22023';end if;
 perform 1 from public.roadmap_ideas where id=p_id and visibility='public' for update;
 if not found then raise exception 'Suggestion unavailable' using errcode='P0002';end if;
 if p_value=0 then delete from public.roadmap_votes where idea_id=p_id and user_id=u;
 else insert into public.roadmap_votes(idea_id,user_id,value) values(p_id,u,p_value)
 on conflict(idea_id,user_id) do update set value=excluded.value,updated_at=clock_timestamp();end if;
 select jsonb_build_object('id',p_id,'myVote',p_value,'upvotes',count(*) filter(where value=1),
 'downvotes',count(*) filter(where value=-1),'score',coalesce(sum(value),0))
 into result from public.roadmap_votes where idea_id=p_id;
 return result;
end $$;
revoke all on function public.rezlee_roadmap_vote(uuid,integer) from public,anon;
grant execute on function public.rezlee_roadmap_vote(uuid,integer) to authenticated;

create function public.rezlee_roadmap_review(p_id uuid,p_operator uuid,p_revision integer,p_visibility text,p_status text,p_priority text,p_response text)
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
 update public.roadmap_ideas set visibility=p_visibility,status=p_status,priority=p_priority,response=trim(p_response),
 decided_at=case when p_status<>'under_review' then coalesce(decided_at,clock_timestamp()) else decided_at end,
 updated_at=clock_timestamp(),revision=revision+1 where id=p_id;
 insert into public.roadmap_review_events(idea_id,operator_id,revision,details)
 values(p_id,p_operator,p_revision+1,jsonb_build_object('visibility',p_visibility,'status',p_status,'priority',p_priority,'response',trim(p_response)));
 return true;
end $$;
revoke all on function public.rezlee_roadmap_review(uuid,uuid,integer,text,text,text,text) from public,anon,authenticated;
grant execute on function public.rezlee_roadmap_review(uuid,uuid,integer,text,text,text,text) to service_role;
notify pgrst,'reload schema';
