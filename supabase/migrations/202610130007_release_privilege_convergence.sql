-- Supabase project default privileges differ. Explicitly preserve the staging
-- boundary rather than inheriting customer write/TRUNCATE or anonymous RPC grants.
revoke all on public.care_plan_receipts,public.rezlee_ai_reservations from public,anon,authenticated;
grant select on public.care_plan_receipts,public.rezlee_ai_reservations to authenticated;
grant all on public.care_plan_receipts,public.rezlee_ai_reservations to service_role;
revoke all on public.rezlee_waitlist,public.rezlee_waitlist_access_log,public.rezlee_waitlist_campaign,public.rezlee_waitlist_limits from public,anon,authenticated;
grant all on public.rezlee_waitlist,public.rezlee_waitlist_access_log,public.rezlee_waitlist_campaign,public.rezlee_waitlist_limits to service_role;
revoke all on function public.is_active_household_member(uuid),public.save_rezlee_care_plan(uuid,text,jsonb,text,uuid[],text),public.save_rezlee_conversation(uuid,uuid,text,boolean,jsonb) from public,anon;
grant execute on function public.is_active_household_member(uuid),public.save_rezlee_care_plan(uuid,text,jsonb,text,uuid[],text),public.save_rezlee_conversation(uuid,uuid,text,boolean,jsonb) to authenticated,service_role;
revoke all on function public.rezlee_confirm_waitlist(uuid,text),public.rezlee_join_waitlist(text,text),public.rezlee_waitlist_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.rezlee_confirm_waitlist(uuid,text),public.rezlee_join_waitlist(text,text),public.rezlee_waitlist_limit(text,integer,integer) to service_role;
notify pgrst,'reload schema';
