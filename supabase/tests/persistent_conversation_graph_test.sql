begin;

set constraints all deferred;

insert into public.conversation_graphs (id)
values ('00000000-0000-0000-0000-000000000001');

insert into public.conversations (id, graph_id, title)
values (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'Distributed systems'
);

insert into public.messages (id, conversation_id, sequence_no, role, content)
values (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000010',
  public.allocate_message_sequence('00000000-0000-0000-0000-000000000010'),
  'user',
  'What is a distributed system?'
);

insert into public.messages (id, conversation_id, sequence_no, role, content)
values (
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000010',
  public.allocate_message_sequence('00000000-0000-0000-0000-000000000010'),
  'assistant',
  'Messages can be delayed or lost.'
);

insert into public.conversations (
  id,
  graph_id,
  title,
  parent_conversation_id,
  parent_message_id,
  branch_selected_text
)
values (
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000001',
  'Why are retries dangerous?',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000102',
  'Messages can be delayed or lost'
);

insert into public.messages (id, conversation_id, sequence_no, role, content)
values (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000020',
  public.allocate_message_sequence('00000000-0000-0000-0000-000000000020'),
  'user',
  'Why does that make retries dangerous?'
);

insert into public.message_references (
  id,
  message_id,
  source_conversation_id,
  source_message_id,
  selected_text
)
values (
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000102',
  'Messages can be delayed or lost'
);

insert into public.generation_requests (
  id,
  idempotency_key,
  conversation_id,
  user_message_id,
  model,
  request_config,
  context_snapshot
)
values (
  '00000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000402',
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000201',
  'gpt-5.6',
  '{"text":{"verbosity":"high"}}',
  '{"message_ids":["00000000-0000-0000-0000-000000000101","00000000-0000-0000-0000-000000000102","00000000-0000-0000-0000-000000000201"]}'
);

update public.generation_requests
set status = 'in_progress', started_at = now(), attempt_count = 1
where id = '00000000-0000-0000-0000-000000000401';

insert into public.messages (id, conversation_id, sequence_no, role, content)
values (
  '00000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000020',
  public.allocate_message_sequence('00000000-0000-0000-0000-000000000020'),
  'assistant',
  'Retries can repeat a side effect when an acknowledgement is lost.'
);

update public.generation_requests
set
  status = 'completed',
  assistant_message_id = '00000000-0000-0000-0000-000000000202',
  provider_response_id = 'resp_phase_1_test',
  completed_at = now()
where id = '00000000-0000-0000-0000-000000000401';

do $$
declare
  root_next_sequence bigint;
  child_next_sequence bigint;
  request_status text;
begin
  select next_message_sequence into root_next_sequence
  from public.conversations
  where id = '00000000-0000-0000-0000-000000000010';

  select next_message_sequence into child_next_sequence
  from public.conversations
  where id = '00000000-0000-0000-0000-000000000020';

  select status into request_status
  from public.generation_requests
  where id = '00000000-0000-0000-0000-000000000401';

  if root_next_sequence <> 3 then
    raise exception 'expected root next sequence 3, got %', root_next_sequence;
  end if;

  if child_next_sequence <> 3 then
    raise exception 'expected child next sequence 3, got %', child_next_sequence;
  end if;

  if request_status <> 'completed' then
    raise exception 'expected completed generation request, got %', request_status;
  end if;

  if not exists (
    select 1
    from public.message_references
    where message_id = '00000000-0000-0000-0000-000000000201'
      and source_message_id = '00000000-0000-0000-0000-000000000102'
  ) then
    raise exception 'selected-text provenance was not stored';
  end if;
end;
$$;

select public.create_root_conversation(
  '10000000-0000-4000-8000-000000000000',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000010',
  'New conversation'
);

select public.start_generation(
  p_owner_id => '10000000-0000-4000-8000-000000000000',
  p_generation_id => '10000000-0000-0000-0000-000000000401',
  p_idempotency_key => '10000000-0000-0000-0000-000000000402',
  p_graph_id => '10000000-0000-0000-0000-000000000001',
  p_conversation_id => '10000000-0000-0000-0000-000000000010',
  p_title => 'Explain databases',
  p_user_message_id => '10000000-0000-0000-0000-000000000101',
  p_content => 'Explain databases',
  p_model => 'gpt-5.6',
  p_request_config => '{"text":{"verbosity":"high"}}',
  p_context_snapshot => '{"messageIds":[]}'
);
select public.claim_generation('10000000-0000-4000-8000-000000000000', '10000000-0000-0000-0000-000000000401');
select public.complete_generation(
  '10000000-0000-4000-8000-000000000000',
  '10000000-0000-0000-0000-000000000401',
  '10000000-0000-0000-0000-000000000102',
  'A database stores organized information.',
  'resp_root'
);

select public.start_generation(
  p_owner_id => '10000000-0000-4000-8000-000000000000',
  p_generation_id => '10000000-0000-0000-0000-000000000411',
  p_idempotency_key => '10000000-0000-0000-0000-000000000412',
  p_graph_id => '10000000-0000-0000-0000-000000000001',
  p_conversation_id => '10000000-0000-0000-0000-000000000020',
  p_title => 'What does relational mean?',
  p_user_message_id => '10000000-0000-0000-0000-000000000201',
  p_content => 'What does relational mean?',
  p_model => 'gpt-5.6',
  p_request_config => '{"text":{"verbosity":"high"}}',
  p_context_snapshot => '{"messageIds":["10000000-0000-0000-0000-000000000101","10000000-0000-0000-0000-000000000102"]}',
  p_parent_conversation_id => '10000000-0000-0000-0000-000000000010',
  p_parent_message_id => '10000000-0000-0000-0000-000000000102',
  p_branch_selected_text => 'organized information',
  p_reference_source_conversation_id => '10000000-0000-0000-0000-000000000010',
  p_reference_source_message_id => '10000000-0000-0000-0000-000000000102',
  p_reference_selected_text => 'organized information'
);
select public.claim_generation('10000000-0000-4000-8000-000000000000', '10000000-0000-0000-0000-000000000411');
select public.complete_generation(
  '10000000-0000-4000-8000-000000000000',
  '10000000-0000-0000-0000-000000000411',
  '10000000-0000-0000-0000-000000000202',
  'Relational databases organize data into tables.',
  'resp_child'
);

select public.start_generation(
  p_owner_id => '10000000-0000-4000-8000-000000000000',
  p_generation_id => '10000000-0000-0000-0000-000000000421',
  p_idempotency_key => '10000000-0000-0000-0000-000000000422',
  p_graph_id => '10000000-0000-0000-0000-000000000001',
  p_conversation_id => '10000000-0000-0000-0000-000000000030',
  p_title => 'Why tables?',
  p_user_message_id => '10000000-0000-0000-0000-000000000301',
  p_content => 'Why tables?',
  p_model => 'gpt-5.6',
  p_request_config => '{"text":{"verbosity":"high"}}',
  p_context_snapshot => '{"messageIds":["10000000-0000-0000-0000-000000000101","10000000-0000-0000-0000-000000000102","10000000-0000-0000-0000-000000000201","10000000-0000-0000-0000-000000000202"]}',
  p_parent_conversation_id => '10000000-0000-0000-0000-000000000020',
  p_parent_message_id => '10000000-0000-0000-0000-000000000202'
);
select public.claim_generation('10000000-0000-4000-8000-000000000000', '10000000-0000-0000-0000-000000000421');
select public.complete_generation(
  '10000000-0000-4000-8000-000000000000',
  '10000000-0000-0000-0000-000000000421',
  '10000000-0000-0000-0000-000000000302',
  'Tables provide a regular structure for records.',
  'resp_nested'
);

do $$
begin
  if (select count(*) from public.conversations where graph_id = '10000000-0000-0000-0000-000000000001') <> 3 then
    raise exception 'expected a three-node persisted graph';
  end if;

  if (select count(*) from public.messages where conversation_id = '10000000-0000-0000-0000-000000000030') <> 2 then
    raise exception 'nested sidequest messages were not persisted';
  end if;

  if (select status from public.generation_requests where id = '10000000-0000-0000-0000-000000000421') <> 'completed' then
    raise exception 'nested generation did not complete';
  end if;
end;
$$;

rollback;
