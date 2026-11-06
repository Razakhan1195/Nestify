-- Independently authorized households must not collide on a utility service point.
-- Existing rows/ids and RLS are preserved. Provider + integration writes are atomic.
begin;
drop index if exists public.provider_integrations_adapter_external_account_uidx;
drop index if exists public.provider_integrations_adapter_resource_uidx;
create unique index provider_integrations_adapter_external_account_uidx
 on public.provider_integrations(adapter,user_id,home_id,external_account_id) where external_account_id is not null;
create unique index provider_integrations_adapter_resource_uidx
 on public.provider_integrations(adapter,user_id,home_id,external_resource_key) where external_resource_key is not null;

create or replace function public.save_rezlee_ezgb_account(
 p_user uuid,p_home uuid,p_resource text,p_utility text,p_category uuid,p_account text,p_values jsonb
) returns public.provider_integrations
language plpgsql security definer set search_path = public,pg_temp as $$
declare v_row public.provider_integrations; v_provider uuid;
begin
 if not exists(select 1 from homes where id=p_home and user_id=p_user)
   or nullif(trim(p_resource),'') is null or nullif(p_values->>'external_account_id','') is null
 then raise exception 'Utility account scope is invalid' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text||':'||p_home::text||':'||p_resource,0));
 select * into v_row from provider_integrations where adapter='ezgb' and user_id=p_user and home_id=p_home and external_resource_key=p_resource for update;
 -- A user disconnect wins over a worker that was already in flight.
 if v_row.status='disconnected' and v_row.external_authorization_id is not distinct from p_values->>'external_authorization_id' then return v_row; end if;
 v_provider:=v_row.provider_id;
 if v_provider is not null and not exists(select 1 from providers where id=v_provider and user_id=p_user and home_id=p_home)
 then raise exception 'Utility provider scope is invalid' using errcode='22023'; end if;
 if v_provider is null then
  insert into providers(user_id,home_id,name,display_name,category_id,account_number,connection_status,health_status,sync_status,data_capabilities)
  values(p_user,p_home,p_utility,p_utility,p_category,p_account,'syncing','healthy','syncing',p_values->'capabilities'||'{"adapter":"ezgb"}'::jsonb) returning id into v_provider;
 else
  update providers set category_id=p_category,display_name=p_utility,account_number=p_account,connection_status='syncing',health_status='healthy',sync_status='syncing',sync_failure_reason=null,requires_user_action=false,user_action_message=null,data_capabilities=p_values->'capabilities'||'{"adapter":"ezgb"}'::jsonb where id=v_provider and user_id=p_user and home_id=p_home;
 end if;
 if v_row.id is null then
  insert into provider_integrations(user_id,home_id,provider_id,adapter,external_resource_key,external_account_id,external_authorization_id,external_usage_point_id,external_user_identifier,status,capabilities,metadata,last_error)
  values(p_user,p_home,v_provider,'ezgb',p_resource,p_values->>'external_account_id',p_values->>'external_authorization_id',p_values->>'external_usage_point_id',p_values->>'external_user_identifier',p_values->>'status',p_values->'capabilities',p_values->'metadata',p_values->>'last_error') returning * into v_row;
 else
  update provider_integrations set provider_id=v_provider,external_account_id=p_values->>'external_account_id',external_authorization_id=p_values->>'external_authorization_id',external_usage_point_id=p_values->>'external_usage_point_id',external_user_identifier=p_values->>'external_user_identifier',status=p_values->>'status',capabilities=p_values->'capabilities',metadata=p_values->'metadata',last_error=p_values->>'last_error'
  where id=v_row.id and user_id=p_user and home_id=p_home returning * into v_row;
 end if;
 return v_row;
end $$;
revoke all on function public.save_rezlee_ezgb_account(uuid,uuid,text,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_rezlee_ezgb_account(uuid,uuid,text,text,uuid,text,jsonb) to service_role;
commit;
