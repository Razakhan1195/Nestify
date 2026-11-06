-- PostgREST verifies the signed bearer JWT before this authenticated-only RPC.
-- Resolve the current Auth identity, durable session and application access in
-- one round trip. Never accept an identity or session ID as a function argument.
create function public.rezlee_authenticated_mobile_context() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); claims jsonb; sid text; identity auth.users%rowtype;
 access_state text;
begin
 if uid is null then raise exception using errcode='PT401',message='Invalid session'; end if;
 begin claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
 exception when others then raise exception using errcode='PT401',message='Invalid session'; end;
 sid:=claims->>'session_id';
 if claims->>'role' is distinct from 'authenticated' or sid is null
  or sid !~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
 then raise exception using errcode='PT401',message='Invalid session'; end if;
 select * into identity from auth.users where id=uid;
 if not found or identity.deleted_at is not null or identity.banned_until>now()
 then raise exception using errcode='PT401',message='Invalid session'; end if;
 if not exists(select 1 from auth.sessions where id=sid::uuid and user_id=uid and (not_after is null or not_after>now()))
 then raise exception using errcode='PT401',message='Invalid session'; end if;
 access_state:=public.rezlee_mobile_access();
 return jsonb_build_object('user',jsonb_build_object('id',identity.id,'email',identity.email,
  'user_metadata',coalesce(identity.raw_user_meta_data,'{}'::jsonb)), 'access',access_state);
end $$;
revoke all on function public.rezlee_authenticated_mobile_context() from public,anon;
grant execute on function public.rezlee_authenticated_mobile_context() to authenticated;
notify pgrst,'reload schema';
