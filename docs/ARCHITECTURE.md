# Architecture

This document describes the current repository. Product intent lives in [Product](PRODUCT.md); planned work lives in [Roadmap](ROADMAP.md).

## Current stack

- Next.js 16.3.6 with the App Router and React/React DOM 19.2.8.
- TypeScript with strict checking and the `@/*` repository-root alias.
- Tailwind CSS 4 through `@tailwindcss/postcss`.
- ESLint 9 with Next.js Core Web Vitals and TypeScript configurations.
- Official OpenAI JavaScript SDK for server-side Responses API calls.
- Supabase JavaScript SDK used server-side with PostgreSQL migrations and transactional RPC functions.
- `react-markdown` for assistant-only CommonMark rendering, with raw HTML disabled.
- npm scripts and a committed npm lockfile.

## Current files and components

| Location | Responsibility |
| --- | --- |
| `app/page.tsx` | Client `Home` component for `/`; local Sidequest prototype with conversation, selection-reference, composer, nested navigation, sidequest creation, parent navigation, and request-context behavior. |
| `app/api/chat/route.ts` | Server-only POST endpoint; persists the generation lifecycle, calls OpenAI with `gpt-5.6`, and persists the assistant response. |
| `app/api/conversations/route.ts` | Loads the browser owner's persisted graph or creates its first root conversation. |
| `lib/` | Server-only Supabase client, anonymous browser ownership, row mapping, and persistence operations. |
| `supabase/migrations/` | Phase 1 graph schema, integrity rules, RLS posture, and transactional write operations. |
| `supabase/tests/` | Transactional PostgreSQL integration scenario for a root, selected child, nested child, and generation lifecycle. |
| `app/layout.tsx` | `RootLayout`; HTML/body wrapper, Geist and Geist Mono via `next/font/google`, global CSS import, and Sidequest title and description metadata. |
| `app/globals.css` | Tailwind import, theme variables, system dark-mode colors, and body styles. |
| `app/favicon.ico` | Starter favicon. |
| `docs/PROGRESS.md` | Current handoff state for future coding agents, including milestone, constraints, completed work, known issues, and next steps. |
| `public/` | Five unused starter SVG assets. |
| `next.config.ts` | Empty custom configuration object. |
| `tsconfig.json` | TypeScript and Next.js type configuration. |
| `eslint.config.mjs`, `postcss.config.mjs` | Lint and CSS processing configuration. |
| `package.json`, `package-lock.json` | Scripts, dependency declarations, and resolved dependency tree. |

There is no separate component library, application service layer, or additional application route.

## Current rendering and data flow

Next.js renders `app/page.tsx` inside the root layout for `/`. `app/layout.tsx` uses the default Server Component model. `app/page.tsx` declares `"use client"` because it owns local React state and click handlers for the branch-and-return prototype. The layout passes its `children` into the body, and the page renders prototype content in a two-column layout using Tailwind utilities and the Geist font. The shell uses a light color palette.

The client model has `Message` objects with `id`, `role`, and `content`, and `Conversation` objects with `id`, `graphId`, `title`, `messages`, `parentConversationId`, `parentMessageId`, and nullable `selectedText`. The app begins with an empty fallback root while persistence initializes. Sending a tangent with the composer’s secondary fork control creates a child containing that user question and makes it active. Without a selection, its parent IDs identify the active conversation and its most recent message. With an attached text reference, `parentMessageId` identifies the selected assistant message and `selectedText` preserves the full passage as branch-origin metadata. Empty conversations cannot branch. Titles use the trimmed question, truncated after 48 characters with an ellipsis. Parent navigation remains compact, and the sidebar recursively renders all descendants.

Assistant Markdown remains normally selectable. A mouse selection is accepted only when its trimmed range starts and ends inside one assistant message. The floating action records the active conversation ID, source message ID, exact selected text, and temporary viewport coordinates. Choosing “Ask about this” attaches that reference to the composer without sending or creating a branch, clears the browser selection, and focuses the textarea. The preview truncates with CSS only; its remove control discards the reference. Conversation navigation also clears unsent references.

Normal Send or Enter appends the trimmed question to the active conversation; Shift+Enter inserts a newline. Sidequest send leaves the parent unchanged. Both modes clear the composer and call `POST /api/chat`. Before each request, `inheritedMessages` walks the parent chain, taking each ancestor’s messages only through the saved branch point, then appends the target conversation’s own messages. This includes ancestor context on both first and subsequent child requests, excludes later parent additions and sibling histories, and works recursively for nested branches. Inherited history exists only in the request payload, never in the child’s visible `messages` array. This relies on the current append-only conversation model.

When a reference is attached, `requestMessagesForConversation` replaces only the request copy of the relevant user question with an explicit passage-and-question representation. Normal send continues the active conversation. Sidequest send stores the selected passage on the child, bounds inherited history at the selected source message, and reapplies the reference to the child’s first question on subsequent requests. Internal conversation and message IDs are not included in model input. Visible message objects continue to contain only what the user typed.

Loading, errors, and assistant responses are keyed to the initiating conversation ID even when the user navigates elsewhere. Sending is disabled while the active conversation is loading. Assistant messages use `react-markdown` with scoped CSS for paragraphs, emphasis, code, lists, and links; user messages remain plain text. No raw HTML rendering or syntax-highlighting plugin is enabled.

`app/api/chat/route.ts` validates incoming messages before converting them to Responses API message input. It currently calls the OpenAI Responses API with `gpt-5.6`, `store: false`, existing adaptive-depth instructions, and high text verbosity, then returns assistant text as JSON. The route reads `process.env.OPENAI_API_KEY` server-side and does not expose secrets to browser code.

When Supabase is configured, the page loads the browser owner's graph through `GET /api/conversations`; if none exists, it creates a root through `POST /api/conversations`. A year-long HttpOnly anonymous-owner cookie scopes reads and transactional mutations. Every send persists its user message, reference/branch provenance, and generation request before inference. OpenAI runs outside a database transaction. Success atomically appends the assistant message and completes the generation; failure records a failed generation while retaining the user message.

There is no OpenAI Conversations usage, streaming, tool calling, web search, RAG, context summarization, or account authentication. Anonymous browser ownership is appropriate for this milestone but is not cross-device identity or account recovery. Without Supabase configuration, the app falls back to in-memory behavior.

`next-env.d.ts` and `.next/` are generated framework artifacts; `node_modules/` contains installed dependencies. These are not application source. Focused event-handler regression tests live in `tests/conversation.test.mjs` and run with `npm test`; they use deterministic hooks and deferred HTTP responses without calling OpenAI. There is no CI configuration.

## Possible future architecture — not implemented or selected

Context optimization, duplicate sidequest handling, streaming behavior, and reading-position restoration after returning to the parent conversation need design before implementation.

Context optimization and the other items above still require separate decisions. Supabase-hosted PostgreSQL is implemented as the persistence backend; account authentication has not been selected or implemented.

## Technical Phase 1 persistence schema — implemented

This section defines the PostgreSQL schema implemented by the ordered migrations in `supabase/migrations/`. Runtime integration is implemented through server-only route handlers and persistence helpers. Applying the migrations and configuring environment variables remain deployment steps; account authentication is not implemented.

### Aggregate and table model

Use a `conversation_graphs` aggregate around each root conversation and its descendants. This makes ownership, row-level security, loading, and whole-tree deletion explicit without copying an owner onto every message.

#### `conversation_graphs`

| Column | PostgreSQL type | Rules and purpose |
| --- | --- | --- |
| `id` | `uuid` | Primary key; generated with `gen_random_uuid()`. |
| `owner_id` | `uuid null` | Stores the anonymous browser-owner UUID for runtime-created graphs. It remains nullable at schema level to allow a later Supabase Auth migration and controlled backfill. |
| `created_at` | `timestamptz` | Not null, default `now()`. |
| `updated_at` | `timestamptz` | Not null, default `now()`; maintained by write operations. |

Important constraints and indexes:

- Primary key on `id`.
- Index on `(owner_id, updated_at desc, id)` for a user's root-thread list and deterministic pagination.
- Current server routes use `owner_id` as an application-level ownership boundary and validate it inside service-role RPCs. Direct client access remains blocked because RLS has no client policies.

#### `conversations`

| Column | PostgreSQL type | Rules and purpose |
| --- | --- | --- |
| `id` | `uuid` | Primary key; generated with `gen_random_uuid()`. |
| `graph_id` | `uuid` | Not null; foreign key to `conversation_graphs(id)` with `ON DELETE CASCADE`. |
| `title` | `text` | Not null; check `length(btrim(title)) > 0`. Stores the locally derived title. |
| `parent_conversation_id` | `uuid null` | Null for the root; otherwise identifies the direct parent in the same graph. |
| `parent_message_id` | `uuid null` | Null for the root; otherwise identifies the exact message at which the child branches. |
| `branch_selected_text` | `text null` | Immutable snapshot of an optional selected passage used to create this branch. Maps from the current `selectedText`. |
| `next_message_sequence` | `bigint` | Not null, default `1`, check greater than zero. Allocates ordered message positions transactionally. |
| `created_at` | `timestamptz` | Not null, default `now()`. |
| `updated_at` | `timestamptz` | Not null, default `now()`. |

Important constraints and indexes:

- Primary key on `id`.
- Unique `(graph_id, id)`, used as the target of a same-graph parent foreign key.
- Same-graph foreign key `(graph_id, parent_conversation_id)` to `conversations(graph_id, id)` with `ON DELETE CASCADE`.
- Composite branch-origin foreign key `(parent_conversation_id, parent_message_id)` to `messages(conversation_id, id)`. It should use `ON DELETE NO ACTION`, be `DEFERRABLE INITIALLY DEFERRED`, and rely on a unique `(conversation_id, id)` key on `messages`.
- Check `parent_conversation_id is null OR parent_conversation_id <> id`.
- Check that roots have all three origin fields null, while children have both parent IDs non-null: `((parent_conversation_id is null and parent_message_id is null and branch_selected_text is null) or (parent_conversation_id is not null and parent_message_id is not null))`.
- Check `branch_selected_text is null OR length(btrim(branch_selected_text)) > 0`.
- Unique partial index on `(graph_id) WHERE parent_conversation_id IS NULL`, allowing at most one root per graph.
- Index `(graph_id, parent_conversation_id, created_at, id)` for full-tree and child traversal.
- Index `(parent_conversation_id, created_at, id)` for direct-child lookup.

The partial unique index enforces at most one root. Creating the graph and its one root in a transaction enforces at least one root at the application boundary. Standard checks cannot prevent longer self-referential cycles such as A → B → A; the branch-creation transaction must reject a parent in the prospective child's descendant chain. Since new conversations are created once with an existing parent and branch origin and branch links are immutable, the normal creation path cannot form such a cycle. A trigger is appropriate if database clients other than the application may update graph links.

#### `messages`

| Column | PostgreSQL type | Rules and purpose |
| --- | --- | --- |
| `id` | `uuid` | Primary key; generated with `gen_random_uuid()`. |
| `conversation_id` | `uuid` | Not null; foreign key to `conversations(id)` with `ON DELETE CASCADE`. |
| `sequence_no` | `bigint` | Not null, check greater than zero. Stable order within one conversation. |
| `role` | `text` | Not null; Phase 1 check restricts values to `user` and `assistant`. |
| `content` | `text` | Not null; check `length(btrim(content)) > 0`. Stores only visible message content. |
| `created_at` | `timestamptz` | Not null, default `now()`. |
| `updated_at` | `timestamptz` | Not null, default `now()`; equal to creation time while messages are append-only. |

Important constraints and indexes:

- Primary key on `id`.
- Unique `(conversation_id, id)` for composite provenance foreign keys.
- Unique `(conversation_id, sequence_no)` for deterministic ordering.
- Index `(conversation_id, sequence_no)` covers ordered conversation reads and branch-boundary reads.
- Message identity, conversation membership, and `sequence_no` should be immutable. Editing later should create message versions rather than rewriting the historical row.

#### `message_references`

This table preserves the existing normal-send reference behavior as well as the reference attached to the first question in a selected-text branch. Keeping it separate prevents request-only context from contaminating visible `messages.content`.

| Column | PostgreSQL type | Rules and purpose |
| --- | --- | --- |
| `id` | `uuid` | Primary key; generated with `gen_random_uuid()`. |
| `message_id` | `uuid` | Not null; the user question carrying the reference, foreign key to `messages(id)` with `ON DELETE CASCADE`. |
| `ordinal` | `smallint` | Not null, default `1`, check greater than zero. Phase 1 writes one reference but the order supports multiple future references. |
| `source_conversation_id` | `uuid` | Not null; conversation containing the referenced assistant message. |
| `source_message_id` | `uuid` | Not null; exact source message. |
| `selected_text` | `text` | Not null; check `length(btrim(selected_text)) > 0`. Full snapshot, never UI-truncated. |
| `created_at` | `timestamptz` | Not null, default `now()`. |

Important constraints and indexes:

- Primary key on `id`.
- Unique `(message_id, ordinal)`.
- Composite foreign key `(source_conversation_id, source_message_id)` to `messages(conversation_id, id)` with `ON DELETE NO ACTION`, preferably deferrable.
- Index `(message_id, ordinal)` for reconstructing request context.
- Index `(source_message_id)` for provenance and deletion checks.

PostgreSQL foreign keys prove that the source message belongs to the stated source conversation. The migration's trigger additionally verifies that the target is a user message, the source is an assistant message, and both conversations belong to the same graph. Runtime branch creation must also ensure that a selected branch's first-message reference matches its branch-origin metadata. Verifying that rendered selected text is a literal substring of Markdown source is intentionally not required: browser-rendered whitespace and formatting can differ. The stored text is an immutable provenance snapshot.

#### `generation_requests`

`generation_requests` is the durable turn/generation lifecycle record between a persisted user message and its eventual assistant response. It prevents an OpenAI call from requiring a long-running database transaction and provides a recovery and idempotency boundary.

| Column | PostgreSQL type | Rules and purpose |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `idempotency_key` | `uuid` | Not null and unique; retries reuse this key. |
| `conversation_id` | `uuid` | Not null; target conversation. |
| `user_message_id` | `uuid` | Not null; composite foreign key proves the input message belongs to the target conversation. |
| `assistant_message_id` | `uuid null` | Set only on completion; composite foreign key proves the output message belongs to the same conversation and unique constraint prevents one assistant message satisfying multiple requests. |
| `status` | `text` | `pending`, `in_progress`, `completed`, `failed`, or `cancelled`. |
| `model` | `text` | Nonblank model identifier used for the attempt. |
| `request_config` | `jsonb` | Object containing non-secret request settings and instruction version. |
| `context_snapshot` | `jsonb` | Immutable provenance manifest for messages, references, and future summary/retrieval inputs. |
| `provider_response_id` | `text null` | Unique when present for provider-side reconciliation. |
| `attempt_count` | `integer` | Nonnegative retry/dispatch count. |
| `error_code`, `error_message` | `text null` | Failure details; never credentials or sensitive provider payloads. |
| `created_at`, `started_at`, `completed_at`, `updated_at` | `timestamptz` | Lifecycle timestamps. |

Lifecycle checks require active requests to have no assistant or completion timestamp, completed requests to have both, and failed/cancelled requests to have a completion timestamp and no assistant. A trigger verifies that input rows are user messages and completed output rows are assistant messages. Indexes support idempotency, active-work recovery, conversation history, user-message lookup, and provider-response reconciliation.

### Message ordering and concurrent writes

Order messages by `sequence_no`, never by `created_at`. An append operation should run in one transaction:

1. Lock the conversation row with `SELECT ... FOR UPDATE` or atomically increment `next_message_sequence` and return the allocated value.
2. Insert the message with that value.
3. Insert any `message_references` rows.
4. Update conversation and graph `updated_at`.
5. Commit.

This serializes appends only within one conversation; different branches remain independent. The unique `(conversation_id, sequence_no)` constraint is the final collision guard. A rolled-back allocation also rolls back the counter update, so ordinary failures do not create gaps. Even if a future operational path produces gaps, ordering remains correct because sequences need to be monotonic, not contiguous. The cost is a brief row lock for concurrent sends to the same conversation, which is preferable to ambiguous ordering or timestamp ties.

Branch boundaries use `parent_message_id`, not a copied sequence number. Joining that immutable message yields its stable `sequence_no`; later parent messages necessarily receive higher numbers and are excluded from inherited context.

### Query shapes

One conversation's messages:

```sql
select m.*
from messages m
where m.conversation_id = $1
order by m.sequence_no;
```

Direct children:

```sql
select c.*
from conversations c
where c.parent_conversation_id = $1
order by c.created_at, c.id;
```

Complete sidebar tree for one owner should first page `conversation_graphs` by `(owner_id, updated_at, id)`, then load all conversations for those graph IDs. A recursive CTE can return display paths/depth when the database should shape the tree:

```sql
with recursive tree as (
  select c.*, 0 as depth, array[c.id] as path
  from conversations c
  join conversation_graphs g on g.id = c.graph_id
  where g.owner_id = $1 and c.parent_conversation_id is null

  union all

  select child.*, tree.depth + 1, tree.path || child.id
  from conversations child
  join tree on child.parent_conversation_id = tree.id
)
select * from tree
order by path;
```

UUID paths do not encode user-friendly sibling order. Phase 1 can sort siblings by `(created_at, id)` in application code after loading the indexed rows. If manual reordering becomes a product requirement, add a dedicated sibling-order key rather than overloading timestamps.

Ancestor context for a nested sidequest uses a recursive walk from the target toward the root. Each child contributes its `parent_message_id` as the cutoff for its parent. Join each cutoff message to get `sequence_no`, then return every ancestor's messages through that number and all target messages. Order the result by root-to-target depth and `sequence_no`. Conceptually:

```sql
with recursive lineage as (
  select c.id, c.parent_conversation_id, c.parent_message_id, 0 as upward_depth
  from conversations c where c.id = $1
  union all
  select parent.id, parent.parent_conversation_id, parent.parent_message_id,
         lineage.upward_depth + 1
  from conversations parent
  join lineage on parent.id = lineage.parent_conversation_id
), bounded as (
  select parent.id as conversation_id,
         origin.sequence_no as max_sequence,
         child.upward_depth + 1 as upward_depth
  from lineage child
  join conversations parent on parent.id = child.parent_conversation_id
  join messages origin on origin.id = child.parent_message_id
  union all
  select id, null, upward_depth from lineage where id = $1
)
select m.*
from bounded b
join messages m on m.conversation_id = b.conversation_id
where b.max_sequence is null or m.sequence_no <= b.max_sequence
order by b.upward_depth desc, m.sequence_no;
```

The production query should also load `message_references` and turn them into the same request-only contextual representation used today. It should enforce a graph/depth limit defensively and detect cycles even though normal writes prohibit them.

### Mapping from current in-memory objects

| Current object/property | Proposed storage |
| --- | --- |
| One root plus all descendants | One `conversation_graphs` row. |
| `Conversation.id` | `conversations.id`. |
| `Conversation.title` | `conversations.title`. |
| `Conversation.parentConversationId` | `conversations.parent_conversation_id`. |
| `Conversation.parentMessageId` | `conversations.parent_message_id`. |
| `Conversation.selectedText` | `conversations.branch_selected_text`. |
| `Conversation.messages[]` | `messages` rows ordered by `sequence_no`. |
| `Message.id`, `role`, `content` | Same concepts on `messages`. |
| Attached normal-send reference | `message_references` row on the new user message. |
| Attached selected sidequest reference | Both branch-origin fields on `conversations` and a `message_references` row on the child's first user message. |
| Local loading/errors/composer/selection coordinates | Ephemeral UI state; not persisted in these tables. |

### Required persistence operations

- `createRoot(firstMessage?)`: transactionally create the graph, root conversation, and optional first user message/reference. An empty root is allowed to preserve the current UX.
- `appendMessage(conversationId, role, content, reference?)`: allocate a sequence, insert the message and optional reference, and touch aggregate timestamps.
- `createBranch(parentConversationId, parentMessageId, selectedText?, question, reference?)`: validate the origin, create the child, allocate and insert its first user message, store reference provenance, and touch the graph in one transaction.
- `startGeneration(conversationId, userMessage, requestMetadata)`: persist the user message and a pending `generation_requests` row with a caller-supplied idempotency key in one transaction.
- `claimGeneration(requestId)`: atomically move a pending request to `in_progress` and increment `attempt_count` so workers cannot double-dispatch it.
- `completeGeneration(requestId, assistantContent, providerResponseId)`: append the ordered assistant message and atomically mark the request completed with its assistant message ID.
- `failGeneration(requestId, error)`: atomically record terminal failure details, leaving the visible user message available for retry/recovery UX.
- `renameConversation(conversationId, title)`: update only the title and timestamps; automatic first-message naming should occur in the same transaction as the first append.
- `loadConversation(conversationId)`: fetch metadata, ordered messages, and references.
- `loadGraphs(ownerId, page)`: fetch root aggregates and their conversation nodes for the sidebar.
- `loadContext(conversationId)`: reconstruct root-to-target bounded history plus selected-text references.
- `deleteConversationSubtree(conversationId)` and `deleteGraph(graphId)`: use controlled operations with the semantics below.

Creating a root, appending a referenced message, creating a branch, assigning the first-message title, allocating message order, creating a generation request, completing/failing a generation, and deleting a subtree should be transactional. Calling OpenAI must not hold a database transaction open. Persist the user message and pending generation request first, call OpenAI, then append the assistant response and complete the request in a second transaction.

### Deletion semantics

- Deleting a root means deleting its `conversation_graphs` aggregate. Cascades remove every conversation, message, and reference in the tree.
- Deleting a sidequest deletes that conversation and its entire descendant subtree. The self-referencing conversation foreign key cascades descendants; messages and their attached references cascade with each deleted conversation.
- A parent message with child branches cannot be deleted independently because the composite branch-origin foreign key uses `ON DELETE NO ACTION`. References from other questions also protect their source messages.
- Phase 1 should expose no general single-message hard-delete operation. Deleting any historical non-origin message would silently change reconstructed context even if no foreign key points to it. Application/database permissions should restrict message deletion to controlled conversation-subtree or graph deletion. Future correction should use redaction or version rows, with an explicit policy for model context.
- Deferrable origin constraints allow a whole graph/subtree transaction to remove dependents and origins together while still rejecting an orphan at commit.

### Future-compatible extension points

- **Authentication and ownership:** `conversation_graphs.owner_id` currently contains an anonymous browser UUID checked by server routes and service-role RPCs. A future auth migration can backfill account ownership, add an `auth.users` foreign key, make it non-null, and introduce authenticated RLS policies.
- **Branch summaries:** add a versioned `conversation_summaries` table keyed by conversation, with covered-through sequence and generation metadata. Do not put mutable summary text on messages.
- **Return with Insight:** add an explicit insight/merge artifact referencing source and destination conversations and the exact source message range; never mutate or merge histories implicitly.
- **Embeddings and semantic retrieval:** add separate chunk and embedding tables keyed to immutable message/version IDs. Keep provider/model/dimension metadata and RLS ownership derivable through the graph.
- **Context provenance:** `message_references` records explicit selected passages; `generation_requests.context_snapshot` records the ordered inputs used for a response and can later point to exact message versions, summaries, and retrieved chunks.
- **Message/version history:** keep stable logical message IDs and add immutable `message_versions`; branch cutoffs and provenance must identify the exact version used, not merely the latest version.

### Risks and unresolved decisions

- Define the exact JSON contract and retention/redaction policy for `generation_requests.request_config` and `context_snapshot` before runtime integration.
- Decide whether empty root graphs should be persisted immediately or only on the first user message. Persisting immediately exactly matches current UX but can create abandoned empty rows.
- Decide pagination and lazy-loading behavior for very large sidebars; loading every graph and node will eventually stop scaling.
- Decide whether sibling order remains creation order or becomes user-controlled.
- Decide whether individual-message redaction is needed before immutable message/version infrastructure exists.
- Replace anonymous browser ownership with authenticated identity and account-level RLS if accounts or cross-device access become product requirements.
- Validate recursive-query depth, cycle protection, transaction isolation, and cascade behavior against realistic nested graphs before accepting a migration.
