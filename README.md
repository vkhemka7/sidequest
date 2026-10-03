# Sidequest

Sidequest is an AI learning interface being developed to help learners explore conversational tangents without losing their place. The intended experience keeps a primary learning thread and lets users branch from a concept or message into a separate conversation, then return to the parent thread.

## Current status

Early frontend foundation. The application currently renders the default Next.js starter page; the Sidequest learning experience is not implemented yet.

Current capabilities are limited to:

- A single starter page at `/` with framework resource links and logos.
- A shared HTML layout, Geist font configuration, and starter metadata.
- Responsive starter styling and system-preference light/dark colors.

There is no conversation UI, sidequest creation, return-to-thread behavior, AI integration, authentication, or persistence.

## Stack

Next.js 16.3.6 (App Router), React 19.2.8, TypeScript 5, Tailwind CSS 4, and ESLint 9. Dependencies are locked in `package-lock.json`.

## Local development

Use Node.js 20.9 or newer and npm. From the repository root:

```bash
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Edit `app/page.tsx` to work on the homepage. No application environment variables or external services are currently required. The layout uses `next/font/google`, which fetches fonts during builds and may require network access.

Available checks and production commands:

```bash
npm run lint
npm run build
npm run start # Run after a successful build
```

There is no test script or CI configuration yet.

## Repository structure

```text
app/                 Route, root layout, global styles, and favicon
public/              Starter SVG assets
docs/               Canonical project documentation
AGENTS.md            Agent workflow guidance and managed Next.js rules
CLAUDE.md            Reference to AGENTS.md
package.json         Dependencies and npm scripts
package-lock.json    Locked dependency tree
```

Framework and tooling configuration lives in `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, and `postcss.config.mjs`.

## Project documentation

- [Product](docs/PRODUCT.md): problem, intended experience, scope, and non-goals.
- [Architecture](docs/ARCHITECTURE.md): current implementation and future possibilities.
- [Roadmap](docs/ROADMAP.md): milestone status and next steps.
- [Decisions](docs/DECISIONS.md): lightweight decision log.

Keep changes scoped, run applicable checks, and update the relevant docs when behavior or direction changes. Detailed implementation tasks belong in GitHub Issues.
