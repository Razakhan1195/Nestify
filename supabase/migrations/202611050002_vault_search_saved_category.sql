-- Keep Vault search and summary consistent with the saved record category.
-- Source describes storage/provenance, not the kind of document.
create or replace function public.rezlee_document_category(p_type text,p_title text,p_file text,p_source text)
returns text language sql immutable parallel safe set search_path='' as $$
 select case when t like '%insurance%' then 'Insurance' when t like '%warranty%' then 'Warranty'
 when t like '%manual%' then 'Manual' when t like '%receipt%' or t like '%invoice%' then 'Receipt'
 when t like '%tax%' then 'Tax' when t like '%lease%' then 'Lease' when t like '%contract%' then 'Contract' else 'Other' end
 from(select lower(concat_ws(' ',p_type,p_title,p_file))t)x;
$$;
create or replace function public.rezlee_document_category(p_category text,p_type text,p_title text,p_file text,p_source text)
returns text language sql immutable parallel safe set search_path='' as $$
 select case when p_category in ('Receipt','Warranty','Insurance','Manual','Lease','Contract','Tax','Other') then p_category
 else public.rezlee_document_category(p_type,p_title,p_file,p_source) end;
$$;
do $migration$
declare signature text; definition text; old_call text; new_call text;
begin
 foreach signature in array array['public.rezlee_vault_summary(uuid)','public.search_rezlee_vault(uuid,text,text,timestamptz,uuid,text)'] loop
  definition := pg_get_functiondef(signature::regprocedure);
  if signature like '%summary%' then
   old_call := 'public.rezlee_document_category(document_type,title,file_name,source)';
   new_call := 'public.rezlee_document_category(category,document_type,title,file_name,source)';
  else
   old_call := 'public.rezlee_document_category(d.document_type,d.title,d.file_name,d.source)';
   new_call := 'public.rezlee_document_category(d.category,d.document_type,d.title,d.file_name,d.source)';
  end if;
  if position(new_call in definition)>0 then continue; end if;
  if position(old_call in definition)=0 then raise exception 'Unexpected Vault function definition: %', signature; end if;
  execute replace(definition,old_call,new_call);
 end loop;
end $migration$;
notify pgrst,'reload schema';
