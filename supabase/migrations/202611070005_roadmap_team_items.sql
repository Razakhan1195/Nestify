-- Team-curated ideas have no customer owner. Customer submissions still require an
-- active verified account; deleting customer-owned ideas must remain hidden.
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

create or replace function public.rezlee_roadmap_vote(p_id uuid,p_value integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null or not public.rezlee_account_active(u) or not public.rezlee_session_allowed()
 or not exists(select 1 from auth.users where id=u and email_confirmed_at is not null) then raise exception 'Sign in required' using errcode='42501';end if;
 if p_value is null or p_value not in (-1,0,1) then raise exception 'Check vote' using errcode='22023';end if;
 perform 1 from public.roadmap_ideas where id=p_id and visibility='public' and (user_id is null or public.rezlee_account_active(user_id)) for update;
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
