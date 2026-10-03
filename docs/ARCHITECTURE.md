# Architecture

This document describes the current repository. Product intent lives in [Product](PRODUCT.md); planned work lives in [Roadmap](ROADMAP.md).

## Current stack

- Next.js 16.3.6 with the App Router and React/React DOM 19.2.8.
- TypeScript with strict checking and the `@/*` repository-root alias.
- Tailwind CSS 4 through `@tailwindcss/postcss`.
- ESLint 9 with Next.js Core Web Vitals and TypeScript configurations.
- npm scripts and a committed npm lockfile.

## Current files and components

| Location | Responsibility |
| --- | --- |
| `app/page.tsx` | `Home` component for `/`; default starter content, external links, and `next/image` logos. |
| `app/layout.tsx` | `RootLayout`; HTML/body wrapper, Geist and Geist Mono via `next/font/google`, global CSS import, and default create-next-app metadata. |
| `app/globals.css` | Tailwind import, theme variables, system dark-mode colors, and body styles. |
| `app/favicon.ico` | Starter favicon. |
| `public/` | Five starter SVG assets; the homepage uses `next.svg` and `vercel.svg`. |
| `next.config.ts` | Empty custom configuration object. |
| `tsconfig.json` | TypeScript and Next.js type configuration. |
| `eslint.config.mjs`, `postcss.config.mjs` | Lint and CSS processing configuration. |
| `package.json`, `package-lock.json` | Scripts, dependency declarations, and resolved dependency tree. |

There is no separate component library, application service layer, or additional application route.

## Current rendering and data flow

Next.js renders `app/page.tsx` inside the root layout for `/`. Both application components use the default Server Component model; neither declares `"use client"`. The layout passes its `children` into the body, and the page renders hardcoded content with static image paths and external link URLs. CSS responds to viewport sizes and the system color preference.

There is no application-managed interactive state, conversation/message model, event-driven branch flow, data fetching, API route, Server Action, database, storage integration, authentication, or LLM client. Framework server rendering does not constitute a product backend.

`next-env.d.ts` and `.next/` are generated framework artifacts; `node_modules/` contains installed dependencies. These are not application source. There is no test suite or CI configuration.

## Possible future architecture — not implemented or selected

A local conversation model and interactive frontend components could support an initial sample-data branch-and-return prototype. State ownership, branch identifiers, parent links, and reading-position restoration need design before implementation.

Real AI responses and persistence would require separate architectural decisions. No backend, database, model provider, authentication system, or hosting target has been selected in this documentation.
