# Progress

## Current milestone

Technical Phase 1 persistence is complete. On 2026-10-05, the user confirmed browser restart reconstruction of the complete graph, titles, messages, hierarchy, isolation, and parent navigation. The remaining anonymous-owner isolation and failed/interrupted generation smoke tests subsequently passed against an isolated local production app connected to the configured hosted Supabase database. The complete automated test suite, SQL integration scenario, lint, and production build passed. No application bug fixes or new features were needed.

## Current implementation state

Sidequest supports root conversations, composer-created sidequests, nested branches, selected-text references, bounded ancestor context, parent/sidebar navigation, and OpenAI Responses API generation. When Supabase is configured, a browser-scoped anonymous owner cookie identifies graphs; the app reconstructs the graph on load and persists user messages, branch/reference provenance, generation requests, assistant messages, and generation outcomes. Without Supabase variables it deliberately falls back to in-memory state.

## Completed work

- Added ordered migrations for conversation graphs, nested conversations, append-ordered messages, selected-text references, durable generation requests, integrity triggers, indexes, RLS posture, and service-role-only transactional RPC operations.
- Integrated persistence into `GET/POST /api/conversations` and `POST /api/chat`, with the OpenAI call outside database transactions and explicit pending, in-progress, completed, and failed generation states.
- Added anonymous browser ownership through a year-long HttpOnly, same-site UUID cookie. Reads and writes are scoped to that owner; account authentication and cross-device recovery remain future work.
- Preserved exact context provenance: child conversations record their parent conversation and branch-point message, selected passages are immutable reference rows, and each generation stores the message IDs used for its request context.
- Preserved the branch UI and context behavior, including immediate local root-title updates, recursive ancestor cutoffs, sibling isolation, and async response isolation.
- Added `docs/RESEARCH.md` as the comprehensive future research space, clearly separated from shipped behavior.
- Documented local setup, environment variables, architecture, decisions, current limitations, and deployment verification status.

## Validation

- `npm test`: passed, 6 tests.
- `npm run lint`: passed.
- `npm run build`: passed with `/`, `/api/chat`, and `/api/conversations`.
- Both migrations applied from scratch on PostgreSQL 17.
- The transactional SQL scenario passed root creation, normal messages, selected-text child creation, nested child creation, message ordering, provenance, and completed generation records.
- Browser restart/reconstruction: passed, as reported by the user on 2026-10-05 (complete graph, titles, messages, hierarchy, isolation, and parent navigation).
- Anonymous-owner isolation: passed with two independent headless Chrome contexts. Each saw only its own graph; cross-owner chat mutation was rejected before provider dispatch, with no inserted message/generation or changed graph. Isolation also held after server restart.
- Provider failure: passed using a local HTTP provider fixture returning 401 through the real OpenAI SDK. The UI displayed an error; exactly one user message persisted, the generation became `failed`, and no assistant message appeared. Reload preserved the question and cleared the transient error. Restoring the fixture's successful response allowed the next generation to complete.
- Interrupted generation: passed by observing `in_progress`, sending SIGKILL to the isolated Next.js production process, restarting, and reloading. The graph matched its pre-termination snapshot exactly, with no duplicates or fabricated assistant message; the interrupted request remained `in_progress` with one attempt.
- Verification environment: `http://localhost:3107`, Next.js production build, installed Google Chrome driven by temporary Playwright tooling, configured hosted Supabase; base revision `7f2a76296c58858a3b94af848521bce2b874bab1` plus the existing working tree. Fault injection used a local provider fixture, not live OpenAI inference. The existing app on port 3000 and `.env.local` were left unchanged. Test-owner graphs were deleted after the successful run; temporary app/provider processes and disposable PostgreSQL container were stopped.
- Full final checks on 2026-10-05: `npm test` (6/6), `npm run lint`, `npm run build`, and `git diff --check` passed. Both migrations and the complete SQL integration scenario also passed on a fresh disposable PostgreSQL 17 database. See [Deployment smoke test](DEPLOYMENT_SMOKE_TEST.md) for scenario evidence.

## Important constraints

- Ancestor messages are request context only; never copy them into visible child history.
- Preserve branch-point and selected-text provenance when changing storage or context construction.
- Keep `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` server-side only.
- Do not present research directions in `docs/RESEARCH.md` as implemented features.

## Known limitations

- Anonymous cookie ownership is browser-local identity. Clearing the cookie loses access, and there is no account recovery or cross-device sync.
- Persistence falls back to in-memory behavior when Supabase is unconfigured.
- Requests are non-streaming and resend bounded raw ancestor context without token-budget management.
- There is no user-facing retry/recovery flow for failed or interrupted generations.
- Reading-position restoration, deletion UI, export, and syntax highlighting are not implemented.

## Milestone boundary

Persistence validation is complete. No next milestone was started, and no commit or push was made. Generation recovery UI, automatic reclamation, and portfolio release work remain outside this completed milestone.

## Last updated

2026-10-05
