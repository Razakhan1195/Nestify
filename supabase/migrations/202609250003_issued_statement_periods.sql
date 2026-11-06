-- Allow already-issued advance bills without changing payment state, ownership, or deduplication.
create or replace function public.validate_bill_upload(p_bill jsonb) returns void
language plpgsql set search_path='' as $$
declare k text; v text;
begin
 if jsonb_typeof(p_bill) is distinct from 'object' then raise exception 'Invalid statement' using errcode='22023'; end if;
 foreach k in array array['bill_title','category','provider_name','account_number','amount','billing_period_start','billing_period_end'] loop
  if jsonb_typeof(p_bill->k) is distinct from 'string' or length(btrim(p_bill->>k))=0 then raise exception 'Missing statement details' using errcode='22023'; end if;
 end loop;
 if length(p_bill->>'bill_title')>140 or length(p_bill->>'category')>80 or length(p_bill->>'provider_name')>120
 or length(p_bill->>'account_number')>80 or length(coalesce(p_bill->>'notes',''))>5000
 or (p_bill->>'amount') !~ '^-?[0-9]{1,10}(\.[0-9]{1,2})?$' then raise exception 'Invalid statement details' using errcode='22023'; end if;
 foreach k in array array['billing_period_start','billing_period_end','issue_date','due_date'] loop
  v:=p_bill->>k;
  if coalesce(v,'')<>'' and (v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (v::date)::text<>v) then raise exception 'Invalid dates' using errcode='22023'; end if;
 end loop;
 if (p_bill->>'billing_period_end')::date < (p_bill->>'billing_period_start')::date
 then raise exception 'Invalid period' using errcode='22023'; end if;
 if nullif(p_bill->>'issue_date','')::date > current_date
 or ((p_bill->>'billing_period_end')::date > current_date and nullif(p_bill->>'issue_date','') is null)
 then raise exception 'Check statement issue date' using errcode='22023'; end if;
end $$;
revoke all on function public.validate_bill_upload(jsonb) from public,anon,authenticated;

notify pgrst,'reload schema';
