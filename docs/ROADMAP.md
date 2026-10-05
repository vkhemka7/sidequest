# Roadmap

Milestones describe outcomes; detailed tasks belong in GitHub Issues. Planned milestones are a proposed sequence, not delivery commitments.

| Milestone | Status | Evidence or intended outcome |
| --- | --- | --- |
| Frontend foundation | Complete | App Router page/layout, Tailwind styling, TypeScript, ESLint, npm scripts, and lockfile exist. A Sidequest shell provides the header, Threads sidebar, and conversation area. |
| Canonical project context | Complete | Product, current architecture, roadmap, decision log, README, and agent guidance are documented. |
| Static learning prototype | Superseded | The earlier hardcoded learning demo was replaced by the neutral interactive Threads prototype. |
| Branch-and-return frontend prototype | Complete | The app creates root, child, and nested conversations; preserves bounded ancestor context and selected-text provenance; supports parent/sidebar navigation; and isolates async responses by branch. Reading-position restoration remains a separate enhancement. |
| Interaction validation | Planned | Evaluate clarity, keyboard access, responsive behavior, and repeated branch/return navigation; add focused checks for implemented behavior. |
| AI and durable history | Complete | Browser restart reconstruction was user-confirmed on 2026-10-05. Independent Chrome owner isolation, rejected cross-owner mutation, durable provider failure, and process-interruption/restart checks passed against the local production app with hosted Supabase. The full automated suite, fresh PostgreSQL 17 migrations/SQL scenario, lint, and production build passed. |

The persistence milestone is complete; see [deployment smoke test evidence](DEPLOYMENT_SMOKE_TEST.md) and [Progress](PROGRESS.md). Failure/interruption checks used a local provider fixture through the real SDK and database. Abrupt termination preserves the unfinished `in_progress` record; automatic recovery and recovery UI remain unimplemented and outside this milestone. No next milestone has been started.
