-- Removing a provider also cancels a pending hosted handoff. The intent has no
-- provider FK so its credential cleanup journal can survive provider removal.
create function public.cancel_rezlee_hosted_on_provider_delete() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if public.rezlee_account_active(old.user_id) then
  update public.deck_hosted_auth_intents set status='canceled' where provider_id=old.id and user_id=old.user_id and status='pending';
 end if;
 return old;
end $$;
create trigger cancel_hosted_on_provider_delete before delete on public.providers for each row execute function public.cancel_rezlee_hosted_on_provider_delete();
revoke all on function public.cancel_rezlee_hosted_on_provider_delete() from public,anon,authenticated;
