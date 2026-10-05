# Deployment smoke test

Run against an isolated test deployment with both migrations applied and server-side Supabase and OpenAI configuration. Failure injection and process interruption require a disposable environment. Use synthetic messages. Record the date, deployment URL, revision, browser, scenario results, and generation IDs; do not record cookies or API keys.

## Graph reconstruction

1. In browser profile A, create a root and send a question. Wait for the assistant response.
2. Select a passage in that response, choose “Ask about this,” and send a sidequest question. Record the selected passage and parent message.
3. Create a nested sidequest, then a sibling. Send another message in the root after the original branch point.
4. Verify each branch shows only its own messages, sidebar hierarchy and titles are correct, and parent navigation returns to the correct conversation.
5. Save the `/api/conversations` JSON response from browser developer tools as a baseline. Restart the browser without clearing cookies, reopen the same origin, and compare graph IDs, titles, message IDs/content/order, parent IDs, and selected-text metadata. Repeat parent navigation.

Pass: the complete graph and provenance match; no sibling or ancestor messages appear in a child's visible history. Active-thread selection and reading-position restoration are not acceptance criteria for this milestone.

## Anonymous-owner isolation

1. Open the same deployment in a separate browser profile B with an independent cookie jar. Confirm `/api/conversations` reports `configured: true` in both profiles.
2. Verify B cannot see A's graph. Create a root in B and verify A cannot see it after refresh.
3. Using developer tools in B, replay a captured test `/api/chat` request from A with B's cookie, retaining A's graph/conversation IDs but using fresh UUIDs for generation, idempotency, and user-message IDs. Do not copy A's cookie into B.
4. Expect a non-success response. Re-fetch A's graph and inspect test-database generation records to confirm no message or generation was inserted by the rejected request.

Pass: independent profiles cannot read or mutate one another's graphs. Branch isolation within one profile is a separate property.

## Provider failure

1. In the isolated server environment, replace the OpenAI key temporarily with a nonempty invalid test value and restart the server. Keep Supabase configured. An absent key is rejected before persistence and does not test durable failure handling.
2. Send a uniquely labeled question. Wait for the request to fail. Verify the UI shows an error and retains the question.
3. Inspect `generation_requests` for the request's generation ID: expect `failed`, recorded error details, and no assistant message. Confirm its user message exists exactly once.
4. Refresh: the user question should remain; the transient UI error is not persisted or reconstructed.
5. Restore the valid server key, restart, and send a new question. Verify normal generation succeeds.

Pass: failure preserves the user message and records a failed generation. Sending a new question is not retrying the original generation; retry UI is not implemented.

## Interrupted generation

1. Send a uniquely labeled question and inspect the test database until its generation is `in_progress`.
2. Terminate the isolated application process before completion; closing a browser tab alone does not reliably stop server inference. If completion wins the race, repeat with a new question.
3. Restart the application and reload in the same browser profile. Verify the persisted user question and existing graph remain intact, without a fabricated assistant answer or duplicate messages.
4. Inspect the generation record. Abrupt process termination can leave it `in_progress`; automatic reclamation, retry, and a recovery UI are not implemented.

Pass for persistence: saved history survives. An unfinished generation is a documented recovery gap, not proof of successful recovery. Record its status and ID for later recovery design.

## Results

| Scenario | Status | Evidence |
| --- | --- | --- |
| Browser restart reconstruction | User-reported pass, 2026-10-05 | Complete graph, titles, messages, hierarchy, isolation, and parent navigation preserved. URL/revision not supplied. |
| Anonymous-owner isolation | Passed, 2026-10-05 | Two independent Chrome contexts saw only their own graphs. Cross-owner mutation returned 500, made no provider call, inserted no message/generation, and changed neither graph. Isolation remained intact after restart. |
| Provider failure | Passed, 2026-10-05 | HTTP 401 fixture through the real SDK produced a visible error and durable `failed` record; exactly one user message survived reload, with no assistant response. Subsequent normal generation completed after provider restoration. |
| Interrupted generation | Passed, 2026-10-05 | SIGKILL after database-confirmed `in_progress`; restart and browser reload reconstructed identical history with no duplicates. Request remained `in_progress`, one attempt, no assistant message. |

### Execution evidence

- App: isolated production copy at `http://localhost:3107`; original development server on port 3000 was not interrupted. Base revision: `7f2a76296c58858a3b94af848521bce2b874bab1` plus working-tree changes.
- Database: configured hosted Supabase, with fresh anonymous test owners. Browser: installed Google Chrome, automated through temporary Playwright tooling with independent cookie jars. HttpOnly, Secure, and SameSite=Lax cookie flags were checked.
- Provider: a local HTTP fixture via the SDK's existing `OPENAI_BASE_URL` configuration returned success/401 or held a request open. This substitutes deterministic fault injection for steps requiring a live invalid key; no production code or saved environment configuration changed. This run validates persistence behavior, not live provider availability.
- Rejected generation ID: `e73cabac-5fb0-4221-a157-b319524a6367` (verified absent).
- Failed generation ID: `70fdc6e6-419e-4f31-ad85-4b1251a9d653`.
- Completed generation after provider restoration: `d064261f-5251-4624-bee8-db1643d7fd4b`.
- Interrupted generation ID: `c6be9cdc-0081-4422-96e9-9e26949a99a7`.
- Test-owner graphs and their dependent rows were cleaned up after verification; these IDs are execution evidence, not retained database fixtures. Temporary app/provider processes and the disposable SQL-test container were stopped.
- Final validation: all 6 automated tests, both migrations and the SQL integration scenario on fresh PostgreSQL 17, lint, production build, and diff whitespace checks passed. No application fixes were necessary.
