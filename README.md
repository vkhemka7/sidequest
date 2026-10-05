# Sidequest

Sidequest is a branch-native AI conversation interface for exploring tangents without losing the original thread. A question can continue the current conversation or create a nested sidequest anchored to an exact message or selected passage.

## Current capabilities

- Familiar chat interface with Markdown assistant responses.
- Root conversations and arbitrarily nested sidequests.
- Exact parent-conversation and parent-message provenance.
- Selected-text references for normal questions or new branches.
- Bounded ancestor context that excludes messages added after a branch point.
- PostgreSQL/Supabase persistence for graphs, ordered messages, references, and generation lifecycle records.
- Anonymous browser ownership through an HttpOnly cookie; no account system yet.
- OpenAI Responses API integration using `gpt-5.6`.

See [Product](docs/PRODUCT.md), [Architecture](docs/ARCHITECTURE.md), [Decisions](docs/DECISIONS.md), and [Research](docs/RESEARCH.md).

## Stack

Next.js 16.3.6, React 19, TypeScript, Tailwind CSS 4, Supabase/PostgreSQL, the official OpenAI SDK, and `react-markdown`.

## Local setup

Requirements:

- Node.js 20.9 or newer
- A Supabase project or local Supabase stack
- An OpenAI API key

Install dependencies:

```bash
npm ci
```

Apply migrations in order from `supabase/migrations/` using the Supabase CLI or dashboard SQL editor. Then copy `.env.example` to `.env.local` and fill in the server-side values:

```bash
cp .env.example .env.local
npm run dev
```

Open [localhost:3000](http://localhost:3000).

`SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` must remain server-only. Never prefix them with `NEXT_PUBLIC_`. When Supabase variables are absent, the UI remains usable for development but conversations are in memory and will not survive refresh.

## Validation

```bash
npm test
npm run lint
npm run build
```

The SQL integration scenario in `supabase/tests/persistent_conversation_graph_test.sql` is intended to run after both migrations against a disposable PostgreSQL/Supabase database. It covers a root, selected-text child, nested child, ordered messages, provenance, and completed generation records.

The repeatable [deployment smoke test](docs/DEPLOYMENT_SMOKE_TEST.md) covers browser reconstruction, anonymous-owner isolation, and failed/interrupted generation behavior. Browser restart reconstruction was confirmed by the user on 2026-10-05; owner isolation and failed/interrupted generation scenarios also passed against an isolated local production app with hosted Supabase and a deterministic provider fixture.

## Repository structure

```text
app/                    UI and server route handlers
lib/                    Server-side Supabase persistence helpers
supabase/migrations/    Ordered PostgreSQL migrations
supabase/tests/         Transactional schema/integration checks
tests/                  Focused conversation behavior tests
docs/                   Product, architecture, decisions, progress, and research
```

## Current limitations

- Browser ownership is an anonymous cookie, not authenticated identity. Clearing cookies loses access to that browser's graphs.
- There is no cross-device sync, account recovery, conversation deletion UI, streaming, retry UI, or offline mode.
- A configured Supabase project is required to verify browser refresh behavior end to end.
- Context still resends bounded raw ancestor messages; summaries and retrieval are research directions, not current functionality.
