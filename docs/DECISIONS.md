# Decisions

A lightweight architecture decision log. Record meaningful choices when made; omit routine implementation details. Dates below are recording dates, not inferred historical adoption dates.

## D001 — Retain the existing frontend foundation

- **Date:** 2026-10-02
- **Status:** Current baseline (observed)
- **Context:** `package.json`, `app/`, and tooling configuration establish Next.js App Router, React, TypeScript, Tailwind CSS, ESLint, and npm's lockfile.
- **Decision:** Document and retain this stack for the current foundation.
- **Reason:** It is already present; this documentation setup does not require application or dependency changes. The original stack-selection rationale is unknown.

## D002 — Center the product on branch-and-return learning

- **Date:** 2026-10-02
- **Status:** Accepted and implemented in the current prototype
- **Context:** The project brief identifies conversational tangents as the problem.
- **Decision:** A sidequest originates from a concept/message, supports separate exploration, and allows a return to the parent thread without losing place.
- **Reason:** This directly addresses the stated learning problem. Specific UI and data-model choices remain open.

## D003 — Keep project context canonical and lightweight

- **Date:** 2026-10-02
- **Status:** Accepted
- **Context:** This is a solo project with an early frontend foundation and shared agent guidance.
- **Decision:** Keep product, architecture, milestone roadmap, and meaningful decisions in `docs/`. Use README for onboarding, AGENTS.md for workflow, and CLAUDE.md's existing reference to AGENTS.md. Put detailed tasks in GitHub Issues.
- **Reason:** Central references reduce duplicated or stale context without adding a heavy process. Preserve the managed Next.js rules block so framework guidance remains available.

## D004 — Sidequest owns branch conversation history

- **Date:** 2026-10-04
- **Status:** Accepted for current prototype
- **Context:** Sidequest needs independent parent and child conversation histories. The first OpenAI integration must keep branch isolation clear while avoiding persistence and provider-managed conversation state.
- **Decision:** Sidequest owns conversation structure and sends the branch's own messages plus bounded ancestor request context (updated by D005) to the OpenAI Responses API through `POST /api/chat`. Supabase persists that app-owned graph when configured; Sidequest does not use provider-managed OpenAI Conversations state.
- **Reason:** The application graph defines parent/child relationships, branch identity, and active conversation state. Keeping that state app-owned preserves isolation without provider-managed conversation state. D005 defines the initial ancestor-context behavior.

## D005 — Create sidequests by sending a tangent

- **Date:** 2026-10-05
- **Status:** Accepted for current prototype
- **Decision:** A sidequest is primarily created by sending a tangent from the composer, rather than creating an empty branch first. A secondary fork control sends the question into a new child of the active conversation, anchored to its most recent message. Normal Send remains primary; permanent message-level branching actions are removed. Titles are derived locally from the trimmed question.
- **Context:** Creating an empty branch before asking adds an unnecessary step to exploring a tangent.
- **Reason:** The question itself expresses the branching intent. Parent history through each saved ancestor branch point is supplied as hidden request context on every child request, rather than duplicated into the child conversation’s visible message history. This provides continuity while keeping histories isolated and supports nested sidequests without summaries or retrieval. It supersedes D004’s original own-history-only request policy.

## D006 — Attach text references before choosing where to send

- **Date:** 2026-10-05
- **Status:** Accepted for current prototype
- **Context:** A learner may want a follow-up to refer precisely to one passage while retaining control over whether that follow-up belongs in the current thread or a sidequest.
- **Decision:** Text selection attaches a reference to the composer; it does not itself create a sidequest. The user still chooses whether the resulting question continues the current thread or creates a child branch.
- **Reason:** Keeping selection, composition, and destination as separate actions preserves normal text copying and avoids turning every selection into a navigation or model request. The full passage is request context and optional branch metadata, while the visible user message remains the learner’s typed question.

## D007 — Persistent conversation graph schema

- **Date:** 2026-10-05
- **Status:** Accepted and implemented for Technical Phase 1
- **Context:** The UX v1 graph originally existed only in React state and disappeared on refresh. Persistence must preserve nested branches, exact message cutoffs, selected-text provenance, normal-send references, and ownership without redesigning the interaction.
- **Decision:** Store each root subtree as a `conversation_graphs` aggregate containing adjacency-linked `conversations`, append-ordered `messages`, explicit `message_references`, and durable `generation_requests`. Use per-conversation monotonic sequence numbers, composite foreign keys for branch/source provenance, transactional graph mutations, aggregate deletion semantics, and idempotent generation lifecycle records.
- **Reason:** The aggregate provides a future Supabase Auth/RLS boundary, explicit sequence numbers prevent timestamp-order ambiguity, and immutable provenance edges preserve the exact historical context used by branches and references. See the persistence section in [Architecture](ARCHITECTURE.md) for the schema, queries, constraints, deletion policy, and unresolved decisions.

## D008 — Scope pre-auth persistence by anonymous browser ownership

- **Date:** 2026-10-05
- **Status:** Accepted for the current milestone
- **Context:** Server routes use a Supabase service-role key and must not expose every graph before account authentication exists.
- **Decision:** Assign each browser an HttpOnly, same-site UUID cookie and store it as `conversation_graphs.owner_id`. Server routes filter and validate graph reads and mutations with that owner. RLS remains enabled without client policies; only server-side transactional functions receive service-role execution grants.
- **Reason:** This preserves refresh and browser-revisit persistence without exposing service credentials or building a premature account system. It is intentionally not cross-device identity or account recovery; Supabase Auth should replace it when accounts become a product requirement.
