begin;

create function public.create_root_conversation(
  p_owner_id uuid,
  p_graph_id uuid,
  p_conversation_id uuid,
  p_title text default 'New conversation'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.conversation_graphs (id, owner_id) values (p_graph_id, p_owner_id);
  insert into public.conversations (id, graph_id, title)
  values (p_conversation_id, p_graph_id, p_title);
end;
$$;

create function public.start_generation(
  p_owner_id uuid,
  p_generation_id uuid,
  p_idempotency_key uuid,
  p_graph_id uuid,
  p_conversation_id uuid,
  p_title text,
  p_user_message_id uuid,
  p_content text,
  p_model text,
  p_request_config jsonb,
  p_context_snapshot jsonb,
  p_parent_conversation_id uuid default null,
  p_parent_message_id uuid default null,
  p_branch_selected_text text default null,
  p_reference_source_conversation_id uuid default null,
  p_reference_source_message_id uuid default null,
  p_reference_selected_text text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  message_sequence bigint;
  existing_graph_id uuid;
  graph_owner_id uuid;
begin
  select owner_id into graph_owner_id
  from public.conversation_graphs
  where id = p_graph_id;

  if graph_owner_id is distinct from p_owner_id then
    raise exception 'conversation graph does not belong to browser owner';
  end if;

  if (
    (p_reference_source_conversation_id is null)::integer
    + (p_reference_source_message_id is null)::integer
    + (p_reference_selected_text is null)::integer
  ) not in (0, 3) then
    raise exception 'reference fields must be all null or all non-null';
  end if;

  select c.graph_id into existing_graph_id
  from public.conversations as c
  where c.id = p_conversation_id;

  if existing_graph_id is null then
    if p_parent_conversation_id is null or p_parent_message_id is null then
      raise exception 'new conversations must include a branch origin';
    end if;

    insert into public.conversations (
      id, graph_id, title, parent_conversation_id, parent_message_id,
      branch_selected_text
    ) values (
      p_conversation_id, p_graph_id, p_title, p_parent_conversation_id,
      p_parent_message_id, p_branch_selected_text
    );
  elsif existing_graph_id <> p_graph_id then
    raise exception 'conversation does not belong to graph';
  elsif p_parent_conversation_id is not null or p_parent_message_id is not null then
    raise exception 'existing conversation cannot receive new branch metadata';
  end if;

  message_sequence := public.allocate_message_sequence(p_conversation_id);

  if message_sequence = 1 then
    update public.conversations
    set title = case when title = 'New conversation' then p_title else title end
    where id = p_conversation_id;
  end if;

  insert into public.messages (id, conversation_id, sequence_no, role, content)
  values (p_user_message_id, p_conversation_id, message_sequence, 'user', p_content);

  if p_reference_source_conversation_id is not null then
    insert into public.message_references (
      message_id, source_conversation_id, source_message_id, selected_text
    ) values (
      p_user_message_id, p_reference_source_conversation_id,
      p_reference_source_message_id, p_reference_selected_text
    );
  end if;

  insert into public.generation_requests (
    id, idempotency_key, conversation_id, user_message_id, model,
    request_config, context_snapshot
  ) values (
    p_generation_id, p_idempotency_key, p_conversation_id,
    p_user_message_id, p_model, p_request_config, p_context_snapshot
  );
end;
$$;

create function public.claim_generation(p_owner_id uuid, p_generation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.generation_requests
  set status = 'in_progress', started_at = now(), attempt_count = attempt_count + 1
  where id = p_generation_id
    and status = 'pending'
    and exists (
      select 1 from public.conversations c
      join public.conversation_graphs g on g.id = c.graph_id
      where c.id = generation_requests.conversation_id
        and g.owner_id = p_owner_id
    );

  if not found then
    raise exception 'generation request is missing or is not pending';
  end if;
end;
$$;

create function public.complete_generation(
  p_owner_id uuid,
  p_generation_id uuid,
  p_assistant_message_id uuid,
  p_content text,
  p_provider_response_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_conversation_id uuid;
  message_sequence bigint;
begin
  select conversation_id into target_conversation_id
  from public.generation_requests
  where id = p_generation_id
    and status = 'in_progress'
    and exists (
      select 1 from public.conversations c
      join public.conversation_graphs g on g.id = c.graph_id
      where c.id = generation_requests.conversation_id
        and g.owner_id = p_owner_id
    )
  for update;

  if target_conversation_id is null then
    raise exception 'generation request is missing or is not in progress';
  end if;

  message_sequence := public.allocate_message_sequence(target_conversation_id);

  insert into public.messages (id, conversation_id, sequence_no, role, content)
  values (
    p_assistant_message_id, target_conversation_id, message_sequence,
    'assistant', p_content
  );

  update public.generation_requests
  set
    status = 'completed',
    assistant_message_id = p_assistant_message_id,
    provider_response_id = p_provider_response_id,
    completed_at = now()
  where id = p_generation_id;
end;
$$;

create function public.fail_generation(
  p_owner_id uuid,
  p_generation_id uuid,
  p_error_code text,
  p_error_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.generation_requests
  set
    status = 'failed',
    error_code = p_error_code,
    error_message = p_error_message,
    completed_at = now()
  where id = p_generation_id
    and status = 'in_progress'
    and exists (
      select 1 from public.conversations c
      join public.conversation_graphs g on g.id = c.graph_id
      where c.id = generation_requests.conversation_id
        and g.owner_id = p_owner_id
    );

  if not found then
    raise exception 'generation request is missing or is not in progress';
  end if;
end;
$$;

revoke all on function public.create_root_conversation(uuid, uuid, uuid, text) from public;
revoke all on function public.start_generation(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, jsonb, jsonb, uuid, uuid, text, uuid, uuid, text) from public;
revoke all on function public.claim_generation(uuid, uuid) from public;
revoke all on function public.complete_generation(uuid, uuid, uuid, text, text) from public;
revoke all on function public.fail_generation(uuid, uuid, text, text) from public;

grant execute on function public.create_root_conversation(uuid, uuid, uuid, text) to service_role;
grant execute on function public.start_generation(uuid, uuid, uuid, uuid, uuid, text, uuid, text, text, jsonb, jsonb, uuid, uuid, text, uuid, uuid, text) to service_role;
grant execute on function public.claim_generation(uuid, uuid) to service_role;
grant execute on function public.complete_generation(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.fail_generation(uuid, uuid, text, text) to service_role;

commit;
