<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Sidequest guidance

Sidequest explores learning tangents through conversational branches and a return to the parent thread. The current app is a Next.js starter; do not describe planned product features as implemented.

Before substantial changes, inspect the relevant canonical context:

- [Product](docs/PRODUCT.md): intent, interaction model, scope, and non-goals.
- [Architecture](docs/ARCHITECTURE.md): existing components and data flow.
- [Roadmap](docs/ROADMAP.md): milestone status; detailed tasks belong in GitHub Issues.
- [Decisions](docs/DECISIONS.md): meaningful choices and known reasons.

Keep changes scoped to the request and avoid unrelated refactors or dependencies. Run `npm run lint` and applicable checks; for application changes, run a build and relevant tests where available. Add focused tests when behavior warrants them, and report checks that could not run. Update relevant canonical docs when behavior, architecture, scope, or milestone status changes; record meaningful decisions without inventing historical rationale. Keep current implementation distinct from future plans.

Preserve the managed Next.js block above exactly and place project-specific guidance outside it. CLAUDE.md references this file; avoid duplicating project context there.
