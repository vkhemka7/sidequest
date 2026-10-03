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
- **Status:** Accepted product direction; not implemented
- **Context:** The project brief identifies conversational tangents as the problem.
- **Decision:** A sidequest originates from a concept/message, supports separate exploration, and allows a return to the parent thread without losing place.
- **Reason:** This directly addresses the stated learning problem. Specific UI and data-model choices remain open.

## D003 — Keep project context canonical and lightweight

- **Date:** 2026-10-02
- **Status:** Accepted
- **Context:** This is a solo project with an early frontend foundation and shared agent guidance.
- **Decision:** Keep product, architecture, milestone roadmap, and meaningful decisions in `docs/`. Use README for onboarding, AGENTS.md for workflow, and CLAUDE.md's existing reference to AGENTS.md. Put detailed tasks in GitHub Issues.
- **Reason:** Central references reduce duplicated or stale context without adding a heavy process. Preserve the managed Next.js rules block so framework guidance remains available.
