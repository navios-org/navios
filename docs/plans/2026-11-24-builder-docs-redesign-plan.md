# Builder Docs Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 40-page Builder section with the 28-page journey-based structure from the design, with every old URL redirected.

**Architecture:** New pages are written fresh under `apps/docs/content/docs/builder/` at the flattened paths; the old `builder/builder/**` and `builder/react-query/{guides,advanced}/**` trees are deleted. `sidebars.mts` lists the new tree, `scripts/renamed-pages.mts` maps every retired URL, and the Rspress build (dead-link check plus `check-urls.mts`) is the test.

**Tech Stack:** Rspress 2, Markdown, `@navios/builder` 2.0.0, `@navios/react-query` 2.0.0.

**Spec:** `docs/plans/2026-11-24-builder-docs-redesign-design.md`

## Global Constraints

- Every API named in an example must exist in `packages/builder/src`, `packages/react-query/src`, or (server page and Introduction only) `packages/core/src`.
- No removed 1.x names outside the migration page: `declareStream`, `declareMultipart`, `useDiscriminatorResponse`, `onZodError`, `isErrorStatus`, `processResponse`, `multipartMutation`, `queryFromEndpoint`.
- Only "Sharing with Navios Server" says the server reads Zod schemas today.
- Code blocks: `ts` / `tsx`, `zod/v4` imports, no semicolons, single quotes.
- Each page has `title` frontmatter (one to four words) — it is the sidebar label.
- No "Best practices" / "Common mistakes" / "Next steps" tail sections.
- Example API: Quick start declares `API`, `userSchema`, `getUser`, `createUser` only. Every other page elides that setup.
- The error-kind table appears only on `essentials/errors`; the response-kind table only on `essentials/responses`.

## Review Focus

- A reader arriving from an old bookmark or search result: every URL in `scripts/url-baseline.txt` resolves (redirect stub or page).
- A reader following a link from the Server, DI or Commander sections or the landing page: no link points at a retired Builder path.
- A reader copying a snippet from a non-Quick-start page: the elided setup is named in a comment so they know where it comes from.
- A reader using a non-Zod schema library: no page other than the server page implies Zod is required.
- A reader on the React Query Errors page: it links to the kind table instead of carrying a stale copy.

Each is checked in Task 6.

---

## File map

New (paths relative to `apps/docs/content/docs/builder/`):

| File | Title |
| --- | --- |
| `index.md` | Introduction |
| `quick-start.md` | Quick start |
| `how-it-works.md` | How it works |
| `essentials/endpoints.md` | Declaring endpoints |
| `essentials/inputs.md` | URL params, query and body |
| `essentials/responses.md` | Responses |
| `essentials/errors.md` | Errors |
| `essentials/schemas.md` | Schemas |
| `essentials/http-client.md` | HTTP client |
| `guides/file-uploads.md` | File uploads |
| `guides/downloads-and-streams.md` | Downloads and streams |
| `guides/navios-server.md` | Sharing with Navios Server |
| `guides/organizing.md` | Organizing an API |
| `guides/testing.md` | Testing |
| `realtime/websocket.md` | WebSocket |
| `realtime/server-sent-events.md` | Server-Sent Events |
| `react-query/index.md` | Quick start |
| `react-query/queries.md` | Queries |
| `react-query/infinite-queries.md` | Infinite queries |
| `react-query/mutations.md` | Mutations |
| `react-query/optimistic-updates.md` | Optimistic updates |
| `react-query/keys-and-invalidation.md` | Keys and invalidation |
| `react-query/errors.md` | Errors |
| `react-query/uploads-and-downloads.md` | Uploads and downloads |
| `react-query/ssr.md` | SSR and prefetching |
| `react-query/recipes/forms.md` | Forms |
| `react-query/recipes/realtime-updates.md` | Realtime updates |
| `reference/builder.md` | @navios/builder API |
| `reference/react-query.md` | @navios/react-query API |
| `reference/migrating-to-2.md` | Migrating to 2.0 |

Deleted: everything under `builder/builder/`, and under `builder/react-query/` the files
`overview.md`, `getting-started.md`, `best-practices.md`, `api-reference.md`, `guides/**`,
`advanced/**`, `recipes/complete-example.md`, `recipes/form-handling.md`.

Redirects (old → new, all prefixed `/docs/builder`):

| Old | New |
| --- | --- |
| `/builder/getting-started` | `/quick-start` |
| `/builder/overview` | `/how-it-works` |
| `/builder/best-practices` | `/guides/organizing` |
| `/builder/api-reference` | `/reference/builder` |
| `/builder/guides/defining-endpoints` | `/essentials/endpoints` |
| `/builder/guides/url-parameters`, `/builder/guides/query-parameters` | `/essentials/inputs` |
| `/builder/guides/schemas` | `/essentials/schemas` |
| `/builder/guides/error-handling` | `/essentials/errors` |
| `/builder/guides/http-client` | `/essentials/http-client` |
| `/builder/advanced/streams` | `/guides/downloads-and-streams` |
| `/builder/advanced/multipart` | `/guides/file-uploads` |
| `/builder/advanced/websocket` | `/realtime/websocket` |
| `/builder/advanced/eventsource` | `/realtime/server-sent-events` |
| `/builder/advanced/discriminated-unions` | `/essentials/responses` |
| `/builder/advanced/custom-handlers` | `/reference/builder` |
| `/react-query/getting-started`, `/react-query/overview`, `/react-query/recipes/complete-example` | `/react-query` |
| `/react-query/best-practices` | `/react-query/queries` |
| `/react-query/api-reference` | `/reference/react-query` |
| `/react-query/guides/queries`, `/react-query/guides/suspense` | `/react-query/queries` |
| `/react-query/guides/infinite-queries` | `/react-query/infinite-queries` |
| `/react-query/guides/mutations`, `/react-query/guides/scoped-mutations`, `/react-query/guides/mutation-context` | `/react-query/mutations` |
| `/react-query/guides/optimistic-updates` | `/react-query/optimistic-updates` |
| `/react-query/guides/query-keys`, `/react-query/guides/invalidation`, `/react-query/advanced/query-client-config` | `/react-query/keys-and-invalidation` |
| `/react-query/guides/file-uploads`, `/react-query/guides/multipart-mutations`, `/react-query/advanced/file-downloads`, `/react-query/advanced/streams` | `/react-query/uploads-and-downloads` |
| `/react-query/advanced/ssr-prefetch` | `/react-query/ssr` |
| `/react-query/advanced/error-schemas` | `/react-query/errors` |
| `/react-query/recipes/form-handling` | `/react-query/recipes/forms` |

---

### Task 1: Builder core pages

**Files:** Create `index.md`, `quick-start.md`, `how-it-works.md`, `essentials/*.md` (6).

- [ ] Write each page to the ownership described in the design's "What each page owns".
- [ ] Check every identifier in the examples against `packages/builder/src`.

### Task 2: Guides and realtime

**Files:** Create `guides/*.md` (5), `realtime/*.md` (2).

- [ ] Read `packages/builder/src/socket/README.md`, `packages/builder/src/eventsource/README.md`, and `packages/core/src/decorators/endpoint.decorator.mts` first.
- [ ] Write the pages; the server page carries the single Zod callout.

### Task 3: React Query pages

**Files:** Create `react-query/*.md` (9), `react-query/recipes/forms.md`; rewrite `react-query/recipes/realtime-updates.md`.

- [ ] Check member names against `packages/react-query/src` exports.
- [ ] Write the pages; the Errors page links to `/docs/builder/essentials/errors` for kinds.

### Task 4: Reference and migration

**Files:** Create `reference/*.md` (3).

- [ ] Build the export lists from `packages/builder/src/index.mts`, `socket/index.mts`, `eventsource/index.mts`, `packages/react-query/src/index.mts`.
- [ ] Source the migration page from both CHANGELOGs.

### Task 5: Wiring

**Files:** Modify `apps/docs/sidebars.mts` (the `builder` entries), `apps/docs/rspress.config.ts` (nav order: Builder first), `apps/docs/scripts/renamed-pages.mts`; delete the retired files; fix inbound links in `content/docs/{server,di,commander}/**`, `content/index.tsx`, `packages/builder/README.md` and `packages/react-query/README.md` doc links.

- [ ] Replace the sidebar with the grouping from the design.
- [ ] Add every redirect from the table; re-point the two existing entries.
- [ ] `grep -rn "docs/builder/builder\|react-query/guides\|react-query/advanced"` across `apps/docs` and `packages/*/README.md` returns nothing outside `renamed-pages.mts` and `url-baseline.txt`.

### Task 6: Verify

- [ ] Run `yarn turbo run build --filter=<docs package name>`; expected: build succeeds, no dead links, `check-urls` reports nothing missing.
- [ ] `grep -rnE "declareStream|declareMultipart|useDiscriminatorResponse|onZodError|isErrorStatus|processResponse|multipartMutation|queryFromEndpoint" apps/docs/content/docs/builder` matches only `reference/migrating-to-2.md`.
- [ ] `grep -rln "must use Zod\|Zod is required\|reads Zod" apps/docs/content/docs/builder` matches only `guides/navios-server.md`.
- [ ] `grep -c "request-validation" ` shows the kind table only on `essentials/errors.md` (other pages may mention single kinds in prose).
- [ ] Open the built site, read the Builder sidebar top to bottom in light and dark mode.
