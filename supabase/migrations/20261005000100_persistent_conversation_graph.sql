begin;

create extension if not exists pgcrypto with schema extensions;

create table public.conversation_graphs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversation_graphs_owner_updated_idx
  on public.conversation_graphs (owner_id, updated_at desc, id);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  graph_id uuid not null,
  title text not null,
  parent_conversation_id uuid,
  parent_message_id uuid,
  branch_selected_text text,
  next_message_sequence bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint conversations_graph_fk
    foreign key (graph_id)
    references public.conversation_graphs (id)
    on delete cascade,
  constraint conversations_graph_id_id_key unique (graph_id, id),
  constraint conversations_parent_same_graph_fk
    foreign key (graph_id, parent_conversation_id)
    references public.conversations (graph_id, id)
    on delete cascade,
  constraint conversations_title_nonempty_check
    check (length(btrim(title)) > 0),
  constraint conversations_sequence_positive_check
    check (next_message_sequence > 0),
  constraint conversations_not_own_parent_check
    check (parent_conversation_id is null or parent_conversation_id <> id),
  constraint conversations_branch_shape_check
    check (
      (
        parent_conversation_id is null
        and parent_message_id is null
        and branch_selected_text is null
      )
      or
      (
        parent_conversation_id is not null
        and parent_message_id is not null
      )
    ),
  constraint conversations_selected_text_nonempty_check
    check (
      branch_selected_text is null
      or length(btrim(branch_selected_text)) > 0
    )
);

create unique index conversations_one_root_per_graph_idx
  on public.conversations (graph_id)
  where parent_conversation_id is null;

create index conversations_graph_parent_created_idx
  on public.conversations (graph_id, parent_conversation_id, created_at, id);

create index conversations_parent_created_idx
  on public.conversations (parent_conversation_id, created_at, id)
  where parent_conversation_id is not null;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  sequence_no bigint not null,
  role text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint messages_conversation_fk
    foreign key (conversation_id)
    references public.conversations (id)
    on delete cascade,
  constraint messages_conversation_id_id_key
    unique (conversation_id, id),
  constraint messages_conversation_sequence_key
    unique (conversation_id, sequence_no),
  constraint messages_sequence_positive_check
    check (sequence_no > 0),
  constraint messages_role_check
    check (role in ('user', 'assistant')),
  constraint messages_content_nonempty_check
    check (length(btrim(content)) > 0)
);

alter table public.conversations
  add constraint conversations_parent_message_fk
  foreign key (parent_conversation_id, parent_message_id)
  references public.messages (conversation_id, id)
  on delete no action
  deferrable initially deferred;

create table public.message_references (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  ordinal smallint not null default 1,
  source_conversation_id uuid not null,
  source_message_id uuid not null,
  selected_text text not null,
  created_at timestamptz not null default now(),

  constraint message_references_message_fk
    foreign key (message_id)
    references public.messages (id)
    on delete cascade,
  constraint message_references_source_message_fk
    foreign key (source_conversation_id, source_message_id)
    references public.messages (conversation_id, id)
    on delete no action
    deferrable initially deferred,
  constraint message_references_message_ordinal_key
    unique (message_id, ordinal),
  constraint message_references_ordinal_positive_check
    check (ordinal > 0),
  constraint message_references_selected_text_nonempty_check
    check (length(btrim(selected_text)) > 0)
);

create index message_references_source_message_idx
  on public.message_references (source_message_id);

create table public.generation_requests (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null,
  conversation_id uuid not null,
  user_message_id uuid not null,
  assistant_message_id uuid,
  status text not null default 'pending',
  model text not null,
  request_config jsonb not null default '{}'::jsonb,
  context_snapshot jsonb not null default '{}'::jsonb,
  provider_response_id text,
  attempt_count integer not null default 0,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),

  constraint generation_requests_idempotency_key_key
    unique (idempotency_key),
  constraint generation_requests_conversation_fk
    foreign key (conversation_id)
    references public.conversations (id)
    on delete cascade,
  constraint generation_requests_user_message_fk
    foreign key (conversation_id, user_message_id)
    references public.messages (conversation_id, id)
    on delete cascade,
  constraint generation_requests_assistant_message_fk
    foreign key (conversation_id, assistant_message_id)
    references public.messages (conversation_id, id)
    on delete no action
    deferrable initially deferred,
  constraint generation_requests_assistant_message_key
    unique (assistant_message_id),
  constraint generation_requests_status_check
    check (status in ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  constraint generation_requests_model_nonempty_check
    check (length(btrim(model)) > 0),
  constraint generation_requests_request_config_object_check
    check (jsonb_typeof(request_config) = 'object'),
  constraint generation_requests_context_snapshot_object_check
    check (jsonb_typeof(context_snapshot) = 'object'),
  constraint generation_requests_attempt_count_check
    check (attempt_count >= 0),
  constraint generation_requests_lifecycle_check
    check (
      (
        status = 'pending'
        and assistant_message_id is null
        and started_at is null
        and completed_at is null
        and error_code is null
        and error_message is null
      )
      or
      (
        status = 'in_progress'
        and assistant_message_id is null
        and started_at is not null
        and completed_at is null
        and error_code is null
        and error_message is null
        and attempt_count > 0
      )
      or
      (
        status = 'completed'
        and assistant_message_id is not null
        and started_at is not null
        and completed_at is not null
        and error_code is null
        and error_message is null
        and attempt_count > 0
      )
      or
      (
        status = 'failed'
        and assistant_message_id is null
        and started_at is not null
        and completed_at is not null
        and attempt_count > 0
      )
      or
      (
        status = 'cancelled'
        and assistant_message_id is null
        and completed_at is not null
      )
    ),
  constraint generation_requests_timestamp_order_check
    check (
      (started_at is null or started_at >= created_at)
      and (completed_at is null or completed_at >= coalesce(started_at, created_at))
    )
);

create index generation_requests_conversation_created_idx
  on public.generation_requests (conversation_id, created_at desc, id);

create index generation_requests_status_created_idx
  on public.generation_requests (status, created_at, id)
  where status in ('pending', 'in_progress');

create index generation_requests_user_message_idx
  on public.generation_requests (user_message_id, created_at desc);

create unique index generation_requests_provider_response_id_idx
  on public.generation_requests (provider_response_id)
  where provider_response_id is not null;

comment on table public.generation_requests is
  'Durable lifecycle and idempotency record for one model generation attempt/turn.';
comment on column public.generation_requests.request_config is
  'Model request settings and instruction version; secrets must never be stored here.';
comment on column public.generation_requests.context_snapshot is
  'Immutable provenance manifest for the messages, references, summaries, and retrieval inputs used by this generation.';

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger conversation_graphs_set_updated_at
before update on public.conversation_graphs
for each row execute function public.set_updated_at();

create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

create trigger generation_requests_set_updated_at
before update on public.generation_requests
for each row execute function public.set_updated_at();

create function public.protect_conversation_structure()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.graph_id is distinct from old.graph_id
    or new.parent_conversation_id is distinct from old.parent_conversation_id
    or new.parent_message_id is distinct from old.parent_message_id
    or new.branch_selected_text is distinct from old.branch_selected_text
  then
    raise exception 'conversation graph and branch-origin fields are immutable';
  end if;

  return new;
end;
$$;

create trigger conversations_protect_structure
before update on public.conversations
for each row execute function public.protect_conversation_structure();

create function public.validate_conversation_origin()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  origin_role text;
begin
  if new.branch_selected_text is null then
    return new;
  end if;

  select m.role
    into origin_role
  from public.messages as m
  where m.conversation_id = new.parent_conversation_id
    and m.id = new.parent_message_id;

  if origin_role is distinct from 'assistant' then
    raise exception 'selected-text branches must originate from an assistant message';
  end if;

  return new;
end;
$$;

create trigger conversations_validate_origin
before insert on public.conversations
for each row execute function public.validate_conversation_origin();

create function public.protect_message_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.conversation_id is distinct from old.conversation_id
    or new.sequence_no is distinct from old.sequence_no
    or new.role is distinct from old.role
    or new.content is distinct from old.content
  then
    raise exception 'historical message fields are immutable';
  end if;

  return new;
end;
$$;

create trigger messages_protect_history
before update on public.messages
for each row execute function public.protect_message_history();

create function public.validate_message_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_role text;
  source_role text;
  target_graph_id uuid;
  source_graph_id uuid;
begin
  select m.role, c.graph_id
    into target_role, target_graph_id
  from public.messages as m
  join public.conversations as c on c.id = m.conversation_id
  where m.id = new.message_id;

  select m.role, c.graph_id
    into source_role, source_graph_id
  from public.messages as m
  join public.conversations as c on c.id = m.conversation_id
  where m.id = new.source_message_id
    and m.conversation_id = new.source_conversation_id;

  if target_role is distinct from 'user' then
    raise exception 'text references must be attached to user messages';
  end if;

  if source_role is distinct from 'assistant' then
    raise exception 'text references must originate from assistant messages';
  end if;

  if target_graph_id is distinct from source_graph_id then
    raise exception 'text references must remain within one conversation graph';
  end if;

  return new;
end;
$$;

create trigger message_references_validate
before insert or update on public.message_references
for each row execute function public.validate_message_reference();

create function public.protect_message_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'message references are immutable';
end;
$$;

create trigger message_references_protect_history
before update on public.message_references
for each row execute function public.protect_message_reference();

create function public.validate_selected_branch_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  branch_record record;
begin
  select
    c.parent_conversation_id,
    c.parent_message_id,
    c.branch_selected_text,
    first_message.id as first_message_id
  into branch_record
  from public.conversations as c
  left join public.messages as first_message
    on first_message.conversation_id = c.id
    and first_message.sequence_no = 1
    and first_message.role = 'user'
  where c.id = new.id;

  if not found or branch_record.branch_selected_text is null then
    return null;
  end if;

  if branch_record.first_message_id is null or not exists (
    select 1
    from public.message_references as reference
    where reference.message_id = branch_record.first_message_id
      and reference.source_conversation_id = branch_record.parent_conversation_id
      and reference.source_message_id = branch_record.parent_message_id
      and reference.selected_text = branch_record.branch_selected_text
  ) then
    raise exception 'selected-text branch must have a matching reference on its first user message';
  end if;

  return null;
end;
$$;

create constraint trigger conversations_validate_selected_branch_reference
after insert on public.conversations
deferrable initially deferred
for each row execute function public.validate_selected_branch_reference();

create function public.validate_generation_request()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  user_role text;
  assistant_role text;
begin
  select m.role into user_role
  from public.messages as m
  where m.conversation_id = new.conversation_id
    and m.id = new.user_message_id;

  if user_role is distinct from 'user' then
    raise exception 'generation requests must point to a user message';
  end if;

  if new.assistant_message_id is not null then
    select m.role into assistant_role
    from public.messages as m
    where m.conversation_id = new.conversation_id
      and m.id = new.assistant_message_id;

    if assistant_role is distinct from 'assistant' then
      raise exception 'completed generation requests must point to an assistant message';
    end if;
  end if;

  return new;
end;
$$;

create trigger generation_requests_validate
before insert or update on public.generation_requests
for each row execute function public.validate_generation_request();

create function public.protect_generation_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.idempotency_key is distinct from old.idempotency_key
    or new.conversation_id is distinct from old.conversation_id
    or new.user_message_id is distinct from old.user_message_id
    or new.model is distinct from old.model
    or new.request_config is distinct from old.request_config
    or new.context_snapshot is distinct from old.context_snapshot
  then
    raise exception 'generation request identity and request snapshots are immutable';
  end if;

  if old.status in ('completed', 'failed', 'cancelled')
    and (
      new.status is distinct from old.status
      or new.assistant_message_id is distinct from old.assistant_message_id
      or new.provider_response_id is distinct from old.provider_response_id
      or new.attempt_count is distinct from old.attempt_count
      or new.error_code is distinct from old.error_code
      or new.error_message is distinct from old.error_message
      or new.started_at is distinct from old.started_at
      or new.completed_at is distinct from old.completed_at
    )
  then
    raise exception 'terminal generation requests are immutable';
  end if;

  if old.status = 'in_progress' and new.status = 'pending' then
    raise exception 'in-progress generation requests cannot return to pending';
  end if;

  if old.provider_response_id is not null
    and new.provider_response_id is distinct from old.provider_response_id
  then
    raise exception 'provider_response_id is immutable once set';
  end if;

  if new.attempt_count < old.attempt_count then
    raise exception 'generation request attempt_count cannot decrease';
  end if;

  return new;
end;
$$;

create trigger generation_requests_protect_history
before update on public.generation_requests
for each row execute function public.protect_generation_request();

create function public.touch_conversation_graph()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.conversation_graphs
  set updated_at = now()
  where id = new.graph_id;

  return new;
end;
$$;

create trigger conversations_touch_graph
after insert or update on public.conversations
for each row execute function public.touch_conversation_graph();

create function public.touch_conversation_from_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;

  return new;
end;
$$;

create trigger messages_touch_conversation
after insert on public.messages
for each row execute function public.touch_conversation_from_message();

create function public.allocate_message_sequence(p_conversation_id uuid)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  allocated_sequence bigint;
begin
  update public.conversations
  set next_message_sequence = next_message_sequence + 1
  where id = p_conversation_id
  returning next_message_sequence - 1 into allocated_sequence;

  if allocated_sequence is null then
    raise exception 'conversation % does not exist', p_conversation_id;
  end if;

  return allocated_sequence;
end;
$$;

alter table public.conversation_graphs enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.message_references enable row level security;
alter table public.generation_requests enable row level security;

revoke all on function public.allocate_message_sequence(uuid) from public;
revoke all on function public.set_updated_at() from public;
revoke all on function public.protect_conversation_structure() from public;
revoke all on function public.validate_conversation_origin() from public;
revoke all on function public.protect_message_history() from public;
revoke all on function public.validate_message_reference() from public;
revoke all on function public.protect_message_reference() from public;
revoke all on function public.validate_selected_branch_reference() from public;
revoke all on function public.validate_generation_request() from public;
revoke all on function public.protect_generation_request() from public;
revoke all on function public.touch_conversation_graph() from public;
revoke all on function public.touch_conversation_from_message() from public;

comment on table public.conversation_graphs is
  'Persistence aggregate for one root conversation and all nested sidequests.';
comment on table public.conversations is
  'Root and child conversation nodes. Branch-origin fields are immutable.';
comment on table public.messages is
  'Append-only visible conversation messages ordered by sequence_no.';
comment on table public.message_references is
  'Selected-text provenance attached to user messages without changing visible content.';

commit;
