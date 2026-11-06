-- Shared hosted authentication handoff for Rogers and Bell.
create or replace function public.queue_rezlee_hosted_import(p_intent uuid,p_credential text,p_job uuid,p_metadata jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare i public.deck_hosted_auth_intents%rowtype; p public.providers%rowtype;
begin
 select * into i from public.deck_hosted_auth_intents where id=p_intent;
 if not found then return false; end if;
 select * into p from public.providers where id=i.provider_id and user_id=i.user_id for update;
 if not found then return false; end if;
 select * into i from public.deck_hosted_auth_intents where id=p_intent for update;
 if i.status<>'pending' or i.credential_id is distinct from p_credential or not public.rezlee_account_active(i.user_id)
 or (p.deck_credential_id is distinct from i.previous_credential_id and p.deck_credential_id is distinct from p_credential)
 or not exists(select 1 from public.deck_telecom_imports where id=p_job and hosted_auth_id=i.id and user_id=i.user_id and provider_id=p.id) then return false; end if;
 update public.providers set deck_credential_id=p_credential,deck_session_id=null,deck_connection_status='queued',connection_status='syncing',health_status='healthy',sync_status='initial_sync_pending',sync_failure_reason=null,requires_user_action=false,user_action_message=null,deck_connection_metadata=p_metadata where id=p.id;
 update public.deck_telecom_imports set credential_id=p_credential,status='queued',message='Checking your provider connection. Your bills will follow.' where id=p_job;
 return true;
end $$;
revoke all on function public.queue_rezlee_hosted_import(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.queue_rezlee_hosted_import(uuid,text,uuid,jsonb) to service_role;
