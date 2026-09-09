-- Replace message history in one transaction; an insert failure preserves prior history.
create or replace function public.save_rezlee_conversation(
  p_home_id uuid, p_conversation_id uuid, p_title text, p_saved boolean, p_messages jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare conversation public.assistant_conversations; message jsonb; ordinal integer := 0;
begin
  if auth.uid() is null or not exists(select 1 from public.homes where id=p_home_id and user_id=auth.uid()) then
    raise exception 'Place not found';
  end if;
  if jsonb_typeof(p_messages) <> 'array' or jsonb_array_length(p_messages) not between 1 and 80 then
    raise exception 'Invalid messages';
  end if;
  if p_conversation_id is null then
    insert into public.assistant_conversations(user_id,home_id,title,is_saved)
      values(auth.uid(),p_home_id,left(p_title,140),coalesce(p_saved,false)) returning * into conversation;
  else
    select * into conversation from public.assistant_conversations
      where id=p_conversation_id and user_id=auth.uid() and home_id=p_home_id for update;
    if not found then raise exception 'Conversation not found'; end if;
    update public.assistant_conversations set title=left(p_title,140),
      is_saved=conversation.is_saved or coalesce(p_saved,false), last_message_at=now()
      where id=conversation.id returning * into conversation;
  end if;
  delete from public.assistant_messages where conversation_id=conversation.id and user_id=auth.uid();
  for message in select value from jsonb_array_elements(p_messages) loop
    if message->>'role' not in ('user','assistant') or length(coalesce(message->>'content','')) not between 1 and 16000 then
      raise exception 'Invalid message';
    end if;
    insert into public.assistant_messages(conversation_id,user_id,home_id,role,content,message_order,source_message_id)
      values(conversation.id,auth.uid(),p_home_id,message->>'role',message->>'content',ordinal,message->>'id');
    ordinal := ordinal + 1;
  end loop;
  return to_jsonb(conversation);
end;
$$;
revoke all on function public.save_rezlee_conversation(uuid,uuid,text,boolean,jsonb) from public, anon;
grant execute on function public.save_rezlee_conversation(uuid,uuid,text,boolean,jsonb) to authenticated;
notify pgrst, 'reload schema';
