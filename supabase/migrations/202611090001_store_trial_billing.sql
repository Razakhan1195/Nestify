-- Compatible with deployed four-argument callers. Metadata and access share the same lease and transaction.
alter table public.rezlee_store_sync add column if not exists billing jsonb;
create or replace function public.rezlee_apply_store_sync(p_user uuid,p_lease uuid,p_expiry timestamptz,p_product text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.rezlee_account_active(p_user) then raise exception 'Account unavailable' using errcode='PT423';end if;
 perform 1 from public.rezlee_store_sync where user_id=p_user and lease_id=p_lease and lease_until>now() for update;
 if not found then raise exception 'Purchase check expired' using errcode='PT409';end if;
 if p_expiry is null then delete from public.rezlee_entitlements where user_id=p_user and source='store';
 else
 if p_expiry<=now() or p_product is null or length(p_product)>200 then raise exception 'Invalid purchase';end if;
 insert into public.rezlee_entitlements(user_id,source,expires_at,product_id) values(p_user,'store',p_expiry,p_product)
 on conflict(user_id,source) do update set expires_at=excluded.expires_at,product_id=excluded.product_id,verified_at=now();
 end if;
 update public.rezlee_store_sync set checked_at=now(),billing=null where user_id=p_user and lease_id=p_lease;
end $$;
revoke all on function public.rezlee_apply_store_sync(uuid,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.rezlee_apply_store_sync(uuid,uuid,timestamptz,text) to service_role;
notify pgrst,'reload schema';

create function public.rezlee_apply_store_billing_sync(p_user uuid,p_lease uuid,p_expiry timestamptz,p_product text,p_billing jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.rezlee_apply_store_sync(p_user,p_lease,p_expiry,p_product);
 update public.rezlee_store_sync set billing=case when p_expiry is null then null else p_billing end
 where user_id=p_user and lease_id=p_lease;
end $$;
revoke all on function public.rezlee_apply_store_billing_sync(uuid,uuid,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.rezlee_apply_store_billing_sync(uuid,uuid,timestamptz,text,jsonb) to service_role;
notify pgrst,'reload schema';
