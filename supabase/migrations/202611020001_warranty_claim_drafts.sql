-- Private, resumable reading receipts. No email delivery or claim submission.
create table public.warranty_claim_drafts (
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  request_id uuid not null,
  fingerprint text not null check (length(fingerprint)=64),
  input jsonb not null check (jsonb_typeof(input)='object'),
  state text not null default 'reading' check (state in ('reading','ready','failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (user_id,request_id)
);
alter table public.warranty_claim_drafts enable row level security;
grant select on public.warranty_claim_drafts to authenticated;
grant all on public.warranty_claim_drafts to service_role;
create policy warranty_claim_private_read on public.warranty_claim_drafts for select to authenticated
using (user_id=auth.uid() and public.rezlee_account_active(auth.uid()));
create trigger guard_warranty_claim_deleting_account before insert or update on public.warranty_claim_drafts
for each row execute function public.guard_deleting_rezlee_account();

create function public.begin_rezlee_warranty_claim(p_home uuid,p_request uuid,p_fingerprint text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid=auth.uid(); row public.warranty_claim_drafts; inserted integer;
begin
 if u is null or not public.rezlee_account_active(u) or not exists(select 1 from public.homes where id=p_home and user_id=u) then
  raise exception 'Home unavailable' using errcode='PT404';
 end if;
 if p_request is null or p_fingerprint is null or length(p_fingerprint)<>64 or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>65536 then
  raise exception 'Invalid request' using errcode='PT400';
 end if;
 insert into public.warranty_claim_drafts(user_id,home_id,request_id,fingerprint,input)
 values(u,p_home,p_request,p_fingerprint,p_input) on conflict(user_id,request_id) do nothing;
 get diagnostics inserted=row_count;
 select * into row from public.warranty_claim_drafts where user_id=u and request_id=p_request for update;
 if row.home_id<>p_home or row.fingerprint<>p_fingerprint or row.input<>p_input then
  raise exception 'Request changed' using errcode='PT409';
 end if;
 return jsonb_build_object('claimed',inserted=1,'draft',to_jsonb(row)-'fingerprint'-'user_id');
end $$;
revoke all on function public.begin_rezlee_warranty_claim(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.begin_rezlee_warranty_claim(uuid,uuid,text,jsonb) to authenticated;

create function public.finish_rezlee_warranty_claim(p_user uuid,p_request uuid,p_fingerprint text,p_result jsonb)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer;
begin
 if p_result is not null and (jsonb_typeof(p_result)<>'object' or octet_length(p_result::text)>65536) then
  raise exception 'Invalid result';
 end if;
 update public.warranty_claim_drafts set state=case when p_result is null then 'failed' else 'ready' end,
 result=p_result,finished_at=now()
 where user_id=p_user and request_id=p_request and fingerprint=p_fingerprint and state='reading'
 and public.rezlee_account_active(p_user);
 get diagnostics changed=row_count;
 return changed=1;
end $$;
revoke all on function public.finish_rezlee_warranty_claim(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.finish_rezlee_warranty_claim(uuid,uuid,text,jsonb) to service_role;
