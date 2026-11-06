-- Search and browse every private Vault entry with bounded, stable keyset pages.
create function public.rezlee_document_category(p_type text,p_title text,p_file text,p_source text)
returns text language sql immutable parallel safe set search_path='' as $$
 select case when t like '%insurance%' then 'Insurance' when t like '%warranty%' then 'Warranty'
 when t like '%manual%' then 'Manual' when t like '%receipt%' or t like '%invoice%' then 'Receipt'
 when t like '%tax%' then 'Tax' when t like '%lease%' then 'Lease' when t like '%contract%' then 'Contract' else 'Other' end
 from(select lower(concat_ws(' ',p_type,p_title,p_file,p_source))t)x;
$$;
create function public.rezlee_vault_summary(p_home uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 with docs as(select public.rezlee_document_category(document_type,title,file_name,source)category,expires_on
 from public.documents where user_id=auth.uid() and home_id=p_home and exists(select 1 from public.homes h where h.id=p_home and h.user_id=auth.uid())),
 items as(select warranty_expires_on from public.inventory_items where user_id=auth.uid() and home_id=p_home and exists(select 1 from public.homes h where h.id=p_home and h.user_id=auth.uid()))
 select jsonb_build_object('recordsCount',(select count(*) from docs),'itemsCount',(select count(*) from items),
 'warrantyCount',(select count(*) from docs where category='Warranty')+(select count(*) from items where warranty_expires_on is not null),
 'expiringSoonCount',(select count(*) from docs where category='Warranty' and expires_on between current_date and current_date+60)+(select count(*) from items where warranty_expires_on between current_date and current_date+60));
$$;
create function public.search_rezlee_vault(p_home uuid,p_view text,p_query text default '',p_before_time timestamptz default null,p_before_id uuid default null,p_before_kind text default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if p_view is null or p_view not in('documents','items','warranties') or p_query is null or length(p_query)>100
 or ((p_before_time is not null or p_before_id is not null or p_before_kind is not null) and (p_before_time is null or p_before_id is null or p_before_kind is null or p_before_kind not in('document','item'))) then raise sqlstate 'PT400' using message='Invalid search';end if;
 if not exists(select 1 from public.homes h where h.id=p_home and h.user_id=auth.uid()) then raise sqlstate 'PT404' using message='Home unavailable';end if;
 with docs as(select d.id,d.title,d.notes,d.expires_on,d.created_at,public.rezlee_document_category(d.document_type,d.title,d.file_name,d.source)category,(d.storage_path is not null)has_file
 from public.documents d where d.home_id=p_home and d.user_id=auth.uid() and p_view<>'items'),
 entries as(
 select 'document'::text kind,id,title,category||' · '||case when has_file then 'File attached' else 'Details saved' end detail,expires_on expires,created_at
 from docs where (p_view<>'warranties' or category='Warranty') and strpos(lower(concat_ws(' ',title,category,notes)),lower(btrim(p_query)))>0
 union all
 select 'item'::text kind,id,name title,coalesce(nullif(concat_ws(' · ',brand,model_number,room_or_area),''),category,'Home item')detail,warranty_expires_on expires,created_at
 from public.inventory_items where home_id=p_home and user_id=auth.uid() and p_view<>'documents' and (p_view<>'warranties' or warranty_expires_on is not null)
 and strpos(lower(concat_ws(' ',name,brand,model_number,room_or_area)),lower(btrim(p_query)))>0
 ),page as(select * from entries where p_before_time is null or (created_at,id,kind)<(p_before_time,p_before_id,p_before_kind) order by created_at desc,id desc,kind desc limit 51),
 shown as(select * from page order by created_at desc,id desc,kind desc limit 50)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(s) order by created_at desc,id desc,kind desc) from shown s),'[]'::jsonb),
 'total',(select count(*) from entries),'nextCursor',case when (select count(*) from page)>50 then(select jsonb_build_object('time',created_at,'id',id,'kind',kind) from shown order by created_at,id,kind limit 1)else null end) into result;
 return result;
end $$;
revoke all on function public.rezlee_vault_summary(uuid),public.search_rezlee_vault(uuid,text,text,timestamptz,uuid,text) from public,anon;
grant execute on function public.rezlee_vault_summary(uuid),public.search_rezlee_vault(uuid,text,text,timestamptz,uuid,text) to authenticated,service_role;
notify pgrst,'reload schema';
