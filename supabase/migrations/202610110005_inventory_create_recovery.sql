-- Durable create receipts; item deletion leaves a content-free replay tombstone.
create table public.inventory_create_requests (
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 home_id uuid not null references public.homes(id) on delete cascade,
 item_id uuid references public.inventory_items(id) on delete set null,
 input_hash text,
 state text not null check(state in ('saved','cancelled')),
 created_at timestamptz not null default now(),
 primary key(user_id,request_id)
);
alter table public.inventory_create_requests enable row level security;
create policy inventory_create_requests_owner on public.inventory_create_requests for select to authenticated using(user_id=auth.uid());
revoke all on public.inventory_create_requests from anon,authenticated;
grant select on public.inventory_create_requests to authenticated;
grant all on public.inventory_create_requests to service_role;
create index inventory_create_requests_home on public.inventory_create_requests(home_id);
create index inventory_create_requests_item on public.inventory_create_requests(item_id) where item_id is not null;

create function public.create_rezlee_home_item(p_home uuid,p_request uuid,p_values jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare receipt public.inventory_create_requests; new_id uuid; fingerprint text; k text; v jsonb;
begin
 if auth.uid() is null or p_request is null then raise sqlstate 'PT400' using message='Invalid request';end if;
 -- Serializes create/cancel/replay for this owned home, including concurrent first calls.
 perform 1 from public.homes where id=p_home and user_id=auth.uid() for update;
 if not found then raise sqlstate 'PT409' using message='Home unavailable';end if;
 if p_values is null or jsonb_typeof(p_values)<>'object' or octet_length(p_values::text)>8192 then raise sqlstate 'PT400' using message='Invalid item';end if;
 for k,v in select * from jsonb_each(p_values) loop
  if k not in ('name','brand','model_number','serial_number','category','room_or_area','product_barcode','warranty_expires_on')
   or (jsonb_typeof(v) not in ('string','null')) or length(coalesce(v#>>'{}',''))>200 then
   raise sqlstate 'PT400' using message='Invalid item';
  end if;
 end loop;
 if coalesce(length(btrim(p_values->>'name')),0)=0 then raise sqlstate 'PT400' using message='Item name required';end if;
 if coalesce(p_values->>'warranty_expires_on','')<>'' then
  begin
   if p_values->>'warranty_expires_on' !~ '^\d{4}-\d{2}-\d{2}$' or to_char((p_values->>'warranty_expires_on')::date,'YYYY-MM-DD')<>p_values->>'warranty_expires_on' then raise exception 'Invalid date';end if;
  exception when others then raise sqlstate 'PT400' using message='Invalid warranty date';end;
 end if;
 fingerprint=encode(sha256(convert_to(p_values::text,'UTF8')),'hex');
 select * into receipt from public.inventory_create_requests where user_id=auth.uid() and request_id=p_request;
 if found then
  if receipt.home_id<>p_home then raise sqlstate 'PT409' using message='Request belongs to another home';end if;
  if receipt.state='cancelled' or receipt.item_id is null then raise sqlstate 'PT410' using message='Save cancelled or item deleted';end if;
  if receipt.input_hash<>fingerprint then raise sqlstate 'PT409' using message='Retry changed';end if;
  return jsonb_build_object('itemId',receipt.item_id,'replayed',true);
 end if;
 insert into public.inventory_items(user_id,home_id,name,brand,model_number,serial_number,category,room_or_area,product_barcode,warranty_expires_on)
 values(auth.uid(),p_home,btrim(p_values->>'name'),nullif(p_values->>'brand',''),nullif(p_values->>'model_number',''),nullif(p_values->>'serial_number',''),nullif(p_values->>'category',''),nullif(p_values->>'room_or_area',''),nullif(p_values->>'product_barcode',''),nullif(p_values->>'warranty_expires_on','')::date) returning id into new_id;
 insert into public.inventory_create_requests(user_id,request_id,home_id,item_id,input_hash,state) values(auth.uid(),p_request,p_home,new_id,fingerprint,'saved');
 return jsonb_build_object('itemId',new_id,'replayed',false);
end $$;

create function public.cancel_rezlee_home_item_create(p_home uuid,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare receipt public.inventory_create_requests;
begin
 if auth.uid() is null or p_request is null then raise sqlstate 'PT400' using message='Invalid request';end if;
 perform 1 from public.homes where id=p_home and user_id=auth.uid() for update;
 if not found then raise sqlstate 'PT409' using message='Home unavailable';end if;
 select * into receipt from public.inventory_create_requests where user_id=auth.uid() and request_id=p_request;
 if found then
  if receipt.home_id<>p_home then raise sqlstate 'PT409' using message='Request belongs to another home';end if;
  return jsonb_build_object('state',case when receipt.state='saved' and receipt.item_id is null then 'deleted' else receipt.state end,'itemId',receipt.item_id);
 end if;
 insert into public.inventory_create_requests(user_id,request_id,home_id,state) values(auth.uid(),p_request,p_home,'cancelled');
 return jsonb_build_object('state','cancelled','itemId',null);
end $$;
revoke all on function public.create_rezlee_home_item(uuid,uuid,jsonb) from public,anon;
revoke all on function public.cancel_rezlee_home_item_create(uuid,uuid) from public,anon;
grant execute on function public.create_rezlee_home_item(uuid,uuid,jsonb),public.cancel_rezlee_home_item_create(uuid,uuid) to authenticated;
