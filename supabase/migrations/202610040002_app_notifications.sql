-- Shared app notification preferences and inbox; provider credentials never enter this data.
begin;
create table public.notification_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 push_enabled boolean not null default true, connections boolean not null default true,
 bills boolean not null default false, care boolean not null default false, recalls boolean not null default true,
 last_bill_push_on date, last_care_push_on date,
 timezone text not null default 'America/Toronto', next_check_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.notification_preferences(user_id,recalls)
 select user_id,bool_or(push_enabled) from public.recall_preferences group by user_id on conflict(user_id) do nothing;
alter table public.deck_telecom_pushes drop constraint deck_telecom_pushes_status_check;
alter table public.deck_telecom_pushes add constraint deck_telecom_pushes_status_check check(status in ('pending','sent','expired','no_device','failed','suppressed'));
alter table public.notification_preferences enable row level security;
create policy "Own notification preferences" on public.notification_preferences for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update on public.notification_preferences to authenticated;
grant all on public.notification_preferences to service_role;
create trigger notification_preferences_updated before update on public.notification_preferences for each row execute function public.set_updated_at();

alter table public.notifications add column category text not null default 'connections' check(category in ('connections','bills','care','recalls'));
alter table public.notifications add column event_key text;
alter table public.notifications add column expires_at timestamptz;
alter table public.notifications add column resolved_at timestamptz;
alter table public.notifications add column delivery_status text not null default 'none' check(delivery_status in ('none','pending','sending','sent','suppressed','failed','uncertain'));
alter table public.notifications add column delivery_started_at timestamptz;
create unique index notification_event_identity on public.notifications(user_id,event_key) where event_key is not null;
create index notification_delivery_pending on public.notifications(created_at) where delivery_status='pending';
-- Existing direct pushes keep their delivery receipts; the shared inbox receives their outcomes.
create function public.mirror_rezlee_telecom_notice() returns trigger language plpgsql security definer set search_path='' as $$
declare h uuid;
begin
 select home_id into h from public.deck_telecom_imports where id=new.import_id and user_id=new.user_id;
 if h is not null then
  insert into public.notifications(user_id,home_id,notification_type,title,body,href,related_table,related_id,metadata,category,event_key,expires_at)
  values(new.user_id,h,'connection_'||new.kind,new.title,new.body,'/app/providers/'||new.provider_id,'providers',new.provider_id,
   jsonb_build_object('mobileHref','/provider/'||new.provider_id,'importId',new.import_id),'connections',new.event_key,new.expires_at)
  on conflict(user_id,event_key) where event_key is not null do nothing;
 end if;
 return new;
end $$;
create trigger telecom_shared_notice after insert on public.deck_telecom_pushes for each row execute function public.mirror_rezlee_telecom_notice();

create function public.resolve_rezlee_telecom_notices() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.notifications set resolved_at=now(),status='read',read_at=coalesce(read_at,now())
 where user_id=new.user_id and metadata->>'importId'=new.id::text and notification_type='connection_verification'
  and resolved_at is null and (new.status<>'verification' or event_key<>new.id::text||':verify:'||coalesce(new.challenge_key,''));
 return new;
end $$;
create trigger telecom_shared_resolution after update of status,challenge_key on public.deck_telecom_imports for each row execute function public.resolve_rezlee_telecom_notices();

create function public.mirror_rezlee_recall_notice() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('pending','in_app') then
  insert into public.notifications(user_id,home_id,notification_type,title,body,href,metadata,category,event_key,expires_at)
  values(new.user_id,new.home_id,'recall_matches','Review potential product recalls','A saved home item may match a recall notice. Check the official details.','/app/inventory',
   '{"mobileHref":"/recalls"}','recalls','recall:'||new.home_id::text||':'||(new.created_at at time zone 'America/Toronto')::date::text,new.created_at+interval '7 days')
  on conflict(user_id,event_key) where event_key is not null do nothing;
 end if;
 return new;
end $$;
create trigger recall_shared_notice after insert on public.recall_events for each row execute function public.mirror_rezlee_recall_notice();

-- Generate reminders from saved records only. Never fetch a provider or notify about archived history.
create function public.refresh_rezlee_notifications(p_user uuid,p_today date) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.notifications set resolved_at=now(),status='read',read_at=coalesce(read_at,now()),delivery_status=case when delivery_status='pending' then 'suppressed' else delivery_status end
 where user_id=p_user and resolved_at is null and (
  expires_at<=now()
  or (notification_type='bill_reminder' and not exists(select 1 from public.bills b where b.id=related_id and b.user_id=p_user and b.status not in ('paid','archived') and b.payment_status not in ('paid','scheduled') and coalesce(b.amount,0)>0 and coalesce(b.autopay_status,'unknown') not in ('enabled','active','enrolled','on') and b.due_date::text=metadata->>'dueDate'))
  or (notification_type='care_reminder' and not exists(select 1 from public.maintenance_tasks t where t.id=related_id and t.status='open' and t.due_date::text=metadata->>'dueDate' and (
    (t.user_id=p_user and (t.assigned_member_id is null or not exists(select 1 from public.household_members hm where hm.id=t.assigned_member_id and hm.status='active' and hm.linked_user_id is not null)))
    or exists(select 1 from public.household_members hm where hm.id=t.assigned_member_id and hm.home_id=t.home_id and hm.status='active' and hm.linked_user_id=p_user)
  )))
 );
 insert into public.notifications(user_id,home_id,notification_type,title,body,href,related_table,related_id,metadata,category,event_key,expires_at,delivery_status)
 select p_user,b.home_id,'bill_reminder',case when b.due_date=p_today then 'A bill is due today' else 'An upcoming bill needs a look' end,
  'Review the saved statement and your payment status.','/app/bills','bills',b.id,
  jsonb_build_object('mobileHref','/bill/'||b.id,'dueDate',b.due_date),'bills','bill:'||b.id::text||':'||b.due_date::text||':'||p_today::text,now()+interval '2 days','pending'
 from public.bills b where b.user_id=p_user and b.status not in ('paid','archived') and b.payment_status not in ('paid','scheduled') and coalesce(b.amount,0)>0
  and coalesce(b.autopay_status,'unknown') not in ('enabled','active','enrolled','on')
  and b.due_date>=p_today and (b.reminder_date=p_today or (b.reminder_date is null and b.due_date in (p_today,p_today+3)))
 on conflict(user_id,event_key) where event_key is not null do nothing;
 insert into public.notifications(user_id,home_id,notification_type,title,body,href,related_table,related_id,metadata,category,event_key,expires_at,delivery_status)
 select p_user,t.home_id,'care_reminder','Your care reminder is due','Open your saved task to review or mark it done.','/app/maintenance','maintenance_tasks',t.id,
  jsonb_build_object('mobileHref','/care/'||t.id,'dueDate',t.due_date),'care','care:'||t.id::text||':'||t.due_date::text,now()+interval '2 days','pending'
 from public.maintenance_tasks t where t.status='open' and t.due_date=p_today and (
  (t.user_id=p_user and (t.assigned_member_id is null or not exists(select 1 from public.household_members hm where hm.id=t.assigned_member_id and hm.status='active' and hm.linked_user_id is not null)))
  or exists(select 1 from public.household_members hm where hm.id=t.assigned_member_id and hm.home_id=t.home_id and hm.status='active' and hm.linked_user_id=p_user)
 )
 on conflict(user_id,event_key) where event_key is not null do nothing;
end $$;
revoke all on function public.refresh_rezlee_notifications(uuid,date) from public,anon,authenticated;
grant execute on function public.refresh_rezlee_notifications(uuid,date) to service_role;
revoke all on function public.mirror_rezlee_telecom_notice(),public.resolve_rezlee_telecom_notices(),public.mirror_rezlee_recall_notice() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
