-- Preserve existing dollar caps and the conservative USD1 pre-call reservation.
-- Successful, fully reported calls settle once at reviewed uncached rates + 10%, rounded up to a cent.
-- Unknown usage, aborted streams and failed calls retain the full reservation.
-- Rates reviewed 2026-10-16: official Google, OpenAI and Vercel model pricing.
create table public.rezlee_ai_spend_attempts (
 id uuid primary key,
 feature text not null check(feature in ('assistant','document','repair','gmail','quote','maintenance')),
 model text not null,
 day_start date not null,
 month_start date not null,
 input_cents_per_million integer not null,
 output_cents_per_million integer not null,
 reserved_cents integer not null default 100 check(reserved_cents=100),
 settled_cents integer check(settled_cents>=0),
 input_tokens bigint,
 output_tokens bigint,
 created_at timestamptz not null default now(),
 settled_at timestamptz
);
alter table public.rezlee_ai_spend_attempts enable row level security;
revoke all on public.rezlee_ai_spend_attempts from public,anon,authenticated;
grant all on public.rezlee_ai_spend_attempts to service_role;
create index rezlee_ai_spend_attempts_unsettled on public.rezlee_ai_spend_attempts(created_at) where settled_at is null;
create function public.reserve_rezlee_ai_attempt(p_id uuid,p_feature text,p_model text) returns text
language plpgsql security definer set search_path='' as $$
declare a public.rezlee_ai_spend_attempts; result text; input_rate integer;output_rate integer;
begin
 if p_id is null or p_feature is null or p_model is null then return 'unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended('rezlee-ai-usd-admission-v1',13102026));
 select * into a from public.rezlee_ai_spend_attempts where id=p_id;
 if found then
  if a.feature<>p_feature or a.model<>p_model or a.settled_at is not null then return 'duplicate';end if;
  return 'allowed';
 end if;
 case p_model
 when 'gemini-2.5-flash' then input_rate:=30;output_rate:=250;
 when 'google/gemini-2.5-flash' then input_rate:=30;output_rate:=250;
 when 'gemini-2.5-flash-lite' then input_rate:=10;output_rate:=40;
 when 'google/gemini-2.5-flash-lite' then input_rate:=10;output_rate:=40;
 when 'openai/gpt-5-mini' then input_rate:=25;output_rate:=200;
 else return 'unavailable';end case;
 result:=public.reserve_rezlee_ai_spend(p_feature,p_model);
 if result<>'allowed' then return result;end if;
 insert into public.rezlee_ai_spend_attempts(id,feature,model,day_start,month_start,input_cents_per_million,output_cents_per_million)
 values(p_id,p_feature,p_model,(now() at time zone 'UTC')::date,date_trunc('month',now() at time zone 'UTC')::date,input_rate,output_rate);
 return 'allowed';
end $$;
create function public.settle_rezlee_ai_attempt(p_id uuid,p_input_tokens bigint,p_output_tokens bigint) returns text
language plpgsql security definer set search_path='' as $$
declare a public.rezlee_ai_spend_attempts; cost integer; delta integer; affected integer;
begin
 if p_id is null or p_input_tokens is null or p_output_tokens is null or p_input_tokens<0 or p_output_tokens<0
  or p_input_tokens>2147483647 or p_output_tokens>2147483647 then return 'unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended('rezlee-ai-usd-admission-v1',13102026));
 select * into a from public.rezlee_ai_spend_attempts where id=p_id for update;
 if not found then return 'unavailable';end if;
 if a.settled_at is not null then return 'already_settled';end if;
 cost:=greatest(1,ceil((p_input_tokens::numeric*a.input_cents_per_million+p_output_tokens::numeric*a.output_cents_per_million)*1.10/1000000))::integer;
 delta:=cost-a.reserved_cents;
 -- A successful response must settle against its original day/month, even across midnight.
 update public.rezlee_ai_spend_windows set reserved_usd_cents=reserved_usd_cents+delta
 where scope in('all',a.feature) and ((kind='day' and starts_on=a.day_start)or(kind='month' and starts_on=a.month_start));
 get diagnostics affected=row_count;
 if affected<>4 then raise exception 'Missing spend reservation' using errcode='P0001';end if;
 update public.rezlee_ai_spend_attempts set settled_cents=cost,input_tokens=p_input_tokens,output_tokens=p_output_tokens,settled_at=now() where id=p_id;
 if cost>a.reserved_cents then
  update public.rezlee_ai_spend_config set enabled=false,updated_at=now() where singleton=true;
  return 'overrun';
 end if;
 return 'settled';
end $$;
revoke all on function public.reserve_rezlee_ai_attempt(uuid,text,text),public.settle_rezlee_ai_attempt(uuid,bigint,bigint) from public,anon,authenticated;
grant execute on function public.reserve_rezlee_ai_attempt(uuid,text,text),public.settle_rezlee_ai_attempt(uuid,bigint,bigint) to service_role;
comment on table public.rezlee_ai_spend_attempts is 'No customer content or identifiers. Each model attempt holds USD1 until complete trustworthy usage is reported. Settlement uses full uncached input and total output including reasoning, a 10% allowance and cent rounding; it is a conservative internal estimate, not a vendor invoice. Uncertain calls retain USD1. Existing global/feature caps and price-review expiry are unchanged.';
notify pgrst,'reload schema';
