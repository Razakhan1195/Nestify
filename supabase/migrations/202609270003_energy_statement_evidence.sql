-- Optional reviewed energy lines in the existing private statement transaction.
-- No column changes; old clients remain valid and existing evidence is preserved.
create function public.rezlee_validated_energy_evidence(e jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare r jsonb; k text; keys text[]:=array['label','kind','amount','quantity','unit','rate','rateUnit','band','quote'];
begin
 if jsonb_typeof(e) is distinct from 'object' then raise exception 'Invalid energy details' using errcode='22023'; end if;
 if e->'version' is distinct from '1'::jsonb or (e->>'service') not in ('electricity','gas') or e->>'service' is null
 or (e->>'scope') not in ('single_service','mixed_or_unclear','net_metering') or e->>'scope' is null
 or jsonb_typeof(e->'lines') is distinct from 'array' or exists(select 1 from jsonb_object_keys(e) x where x not in ('version','service','scope','lines'))
 then raise exception 'Invalid energy details' using errcode='22023'; end if;
 if jsonb_array_length(e->'lines')>16 then raise exception 'Too many energy lines' using errcode='22023'; end if;
 for r in select * from jsonb_array_elements(e->'lines') loop
  if jsonb_typeof(r) is distinct from 'object' then raise exception 'Invalid energy line' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(r) x where not(x=any(keys))) then raise exception 'Unknown energy field' using errcode='22023'; end if;
  foreach k in array keys loop
   if jsonb_typeof(r->k) is distinct from 'string' then raise exception 'Invalid energy value' using errcode='22023'; end if;
  end loop;
  if length(btrim(r->>'label'))=0 or length(r->>'label')>80 or length(r->>'quote')>160
  or (r->>'kind') not in ('energy','delivery','fixed','regulatory','tax','credit','other')
  or (r->>'band') not in ('','off_peak','mid_peak','on_peak','ultra_low','tier_1','tier_2','other')
  or (r->>'unit') not in ('','kWh','m³','GJ','day','month')
  or (r->>'rateUnit') not in ('','CAD/kWh','cents/kWh','CAD/m³','cents/m³','CAD/GJ','cents/GJ','CAD/day','CAD/month')
  then raise exception 'Invalid energy line' using errcode='22023'; end if;
  if r->>'amount'<>'' and r->>'amount' !~ '^-?[0-9]{1,10}(\.[0-9]{1,2})?$' then raise exception 'Invalid energy amount' using errcode='22023'; end if;
  if r->>'kind'='credit' and nullif(r->>'amount','')::numeric>0 then raise exception 'Invalid energy credit' using errcode='22023'; end if;
  if r->>'quantity'<>'' and r->>'quantity' !~ '^[0-9]{1,8}(\.[0-9]{1,6})?$' then raise exception 'Invalid energy quantity' using errcode='22023'; end if;
  if r->>'rate'<>'' and r->>'rate' !~ '^[0-9]{1,6}(\.[0-9]{1,9})?$' then raise exception 'Invalid energy rate' using errcode='22023'; end if;
  if ((r->>'quantity'='')<>(r->>'unit'='')) or ((r->>'rate'='')<>(r->>'rateUnit'=''))
  or (r->>'amount'='' and r->>'quantity'='' and r->>'rate'='') then raise exception 'Incomplete energy line' using errcode='22023'; end if;
 end loop;
 return e;
end $$;
revoke all on function public.rezlee_validated_energy_evidence(jsonb) from public,anon,authenticated;

-- Additive: old clients omit supporting_details and retain the existing save contract.
create or replace function public.rezlee_upload_reviewed_evidence(p jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare e jsonb:=p->'supporting_details'; f jsonb; q jsonb; k text; v text;
 keys text[]:=array['previousBalance','amountDue','subtotal','tax','credits','usage','unit','reading','ratePlan','discountEnds'];
begin
 if e is null then return '{}'::jsonb; end if;
 f:=e->'fields'; q:=e->'quotes';
 if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(f) is distinct from 'object' or jsonb_typeof(q) is distinct from 'object'
 then raise exception 'Invalid supporting details' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(e) x where x not in ('fields','quotes','energy'))
 or exists(select 1 from jsonb_object_keys(f) x where not(x=any(keys)))
 then raise exception 'Unknown supporting details' using errcode='22023'; end if;
 foreach k in array keys loop
  if jsonb_typeof(f->k) is distinct from 'string' or length(f->>k)>120 then raise exception 'Invalid supporting value' using errcode='22023'; end if;
 end loop;
 for k,v in select * from jsonb_each_text(q) loop
  if not(k=any(keys)) or jsonb_typeof(q->k) is distinct from 'string' or length(btrim(v))=0 or length(v)>160 or length(f->>k)=0
  then raise exception 'Invalid supporting quote' using errcode='22023'; end if;
 end loop;
 foreach k in array array['previousBalance','amountDue','subtotal','tax','credits'] loop
  v:=f->>k;
  if v<>'' and v !~ '^-?[0-9]{1,10}(\.[0-9]{1,2})?$' then raise exception 'Invalid money value' using errcode='22023'; end if;
 end loop;
 if nullif(f->>'credits','')::numeric<0 then raise exception 'Invalid credit' using errcode='22023'; end if;
 if f->>'usage'<>'' and f->>'usage' !~ '^[0-9]{1,10}(\.[0-9]{1,6})?$' then raise exception 'Invalid usage' using errcode='22023'; end if;
 if (f->>'unit') not in ('','kWh','m³','GJ','L','Other') or ((f->>'usage'='')<>(f->>'unit'=''))
 or (f->>'reading') not in ('','actual','estimated','mixed','unknown') then raise exception 'Invalid usage details' using errcode='22023'; end if;
 v:=f->>'discountEnds';
 if v<>'' and (v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (v::date)::text<>v) then raise exception 'Invalid discount date' using errcode='22023'; end if;
 return jsonb_build_object('statement_evidence',f,'statement_evidence_quotes',q,'statement_evidence_source','upload_review',
  'statement_evidence_reviewed_at',now(),'statement_evidence_basis',jsonb_build_object('amount',(p->>'amount')::numeric,
  'start',p->>'billing_period_start','end',p->>'billing_period_end','provider',p->>'provider_name','account',p->>'account_number','category',p->>'category')) || case when e ? 'energy' then jsonb_build_object('statement_energy_evidence',public.rezlee_validated_energy_evidence(e->'energy'),'statement_energy_reviewed_at',now(),'statement_energy_basis',jsonb_build_object('amount',(p->>'amount')::numeric,'start',p->>'billing_period_start','end',p->>'billing_period_end','provider',p->>'provider_name','account',p->>'account_number','category',p->>'category')) else '{}'::jsonb end;
end $$;
revoke all on function public.rezlee_upload_reviewed_evidence(jsonb) from public,anon,authenticated;


create function public.rezlee_statement_energy_evidence_available() returns boolean language sql stable security invoker set search_path='' as $$select auth.uid() is not null$$;
revoke all on function public.rezlee_statement_energy_evidence_available() from public,anon;
grant execute on function public.rezlee_statement_energy_evidence_available() to authenticated;
notify pgrst,'reload schema';
