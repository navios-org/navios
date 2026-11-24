# Builder docs redesign — design

Date: 2026-11-24
Scope: `apps/docs/content/docs/builder/**` (both `@navios/builder` and `@navios/react-query`),
`apps/docs/sidebars.mts`, `apps/docs/rspress.config.ts`, `apps/docs/scripts/renamed-pages.mts`.

## Intent

The Builder section is the entry point of the site: Server, React Query and the socket / SSE
builders all consume the endpoint declarations it produces. Today the section is 40 pages,
about 11,200 lines and 528 code blocks. The content already describes the 2.0 API correctly, but
the structure is accidental: the same quick start, the same option explanations and the same
"best practices" appear on several pages, large parts are tutorials for other tools (Zod, React
file inputs), and the central idea — one contract shared by client, server and hooks — gets one
sentence.

The rewrite rebuilds the section around how a developer moves through it, with each concept
explained in exactly one place.

## Goals

- A new reader understands what Builder is and whether it fits in one screen.
- A first working endpoint, including one handled error, in a single page.
- Every concept has one home page; every other page links to it instead of re-explaining it.
- Advanced topics are reachable from the sidebar by the task the developer has, not by API name.
- The shared-contract story (client ↔ Navios Server ↔ React Query) is a first-class page.
- Old URLs keep resolving.

## Non-goals

- No change to package code, READMEs or CHANGELOGs.
- No rewrite of the Server, DI or Commander sections. Their links into Builder are updated only.
- No theme or landing-page work beyond nav order.

## Anti-goals

- A page that exists only because an API exists (for example a page per option).
- Teaching Zod, TanStack Query or browser file APIs. Link to their docs.
- Boilerplate tails on every page: "Best practices", "Common mistakes", "Next steps" lists.
- Documenting anything not verifiable in the package sources on this branch:
  `packages/builder/src`, `packages/react-query/src`, and — for the server-side content on
  Introduction and "Sharing with Navios Server" only — `packages/core/src`.

## Constraints

- Source of truth is the code on this branch (`@navios/builder` 2.0.0, `@navios/react-query`
  2.0.0). The package READMEs and CHANGELOGs are accurate summaries and can be used as a map,
  but every example must match the real exported API.
- Rspress fails the build on dead links and dead anchors (`checkDeadLinks`, `checkAnchors`).
- `scripts/check-urls.mts` fails when a URL in `scripts/url-baseline.txt` stops resolving, so
  every moved or removed page needs an entry in `scripts/renamed-pages.mts`.
- Sidebar labels come from each page's `title` frontmatter or first heading (`sidebars.mts`).
- Schemas: Builder is Standard Schema based, and `@navios/core` is becoming Standard Schema
  compliant too. The docs present Standard Schema as the model and Zod as "the library these
  examples use". The current server-side restriction (core reads Zod schemas today) is stated
  in exactly one callout, on the "Sharing with Navios Server" page, so it can be deleted in one
  place when core lands. No other page says Zod is required.

## Approaches considered

1. **Journey-based (chosen).** The sidebar follows the reader's flows: understand → first
   endpoint → essentials in learning order → task guides → realtime → React Query → reference.
   One home per concept. Chosen by the owner.
2. **Four doc types** (tutorials / how-to / explanation / reference). Tidy taxonomy, but for a
   library this size it spreads each topic over four places — the hopping this work removes.
3. **A few long pages**, close to the READMEs. Least repetition, but pages get very long, are
   hard to land on from search, and give the sidebar nothing to navigate by.

## Reader flows

| # | The reader wants to… | Lands on |
| - | -------------------- | -------- |
| 1 | know what this is and whether it fits | Introduction |
| 2 | get one endpoint working | Quick start |
| 3 | understand the model before going deeper | How it works |
| 4 | do an everyday thing (params, body, response, error) | Essentials |
| 5 | do a specific task (upload, download, share with server, test) | Guides |
| 6 | find out why a call failed | Errors |
| 7 | use it from React | React Query |
| 8 | look up an exact option, type or export | Reference |
| 9 | upgrade from 1.x | Migrating to 2.0 |

## Structure

URLs are flattened: Builder pages move from `/docs/builder/builder/...` to `/docs/builder/...`;
React Query pages stay under `/docs/builder/react-query/...`; reference pages live under
`/docs/builder/reference/...`.

```
/docs/builder/                              Introduction
/docs/builder/quick-start                   Quick start
/docs/builder/how-it-works                  How it works

Essentials
/docs/builder/essentials/endpoints          Declaring endpoints
/docs/builder/essentials/inputs             URL params, query and body
/docs/builder/essentials/responses          Responses
/docs/builder/essentials/errors             Errors
/docs/builder/essentials/schemas            Schemas
/docs/builder/essentials/http-client        HTTP client

Guides
/docs/builder/guides/file-uploads           File uploads
/docs/builder/guides/downloads-and-streams  Downloads and streams
/docs/builder/guides/navios-server          Sharing with Navios Server
/docs/builder/guides/organizing             Organizing an API
/docs/builder/guides/testing                Testing

Realtime
/docs/builder/realtime/websocket            WebSocket
/docs/builder/realtime/server-sent-events   Server-Sent Events

React Query
/docs/builder/react-query/                  Quick start
/docs/builder/react-query/queries           Queries
/docs/builder/react-query/infinite-queries  Infinite queries
/docs/builder/react-query/mutations         Mutations
/docs/builder/react-query/optimistic-updates Optimistic updates
/docs/builder/react-query/keys-and-invalidation Keys and invalidation
/docs/builder/react-query/errors            Errors
/docs/builder/react-query/uploads-and-downloads Uploads and downloads
/docs/builder/react-query/ssr               SSR and prefetching
/docs/builder/react-query/recipes/forms     Forms
/docs/builder/react-query/recipes/realtime-updates Realtime updates

Reference
/docs/builder/reference/builder             @navios/builder API
/docs/builder/reference/react-query         @navios/react-query API
/docs/builder/reference/migrating-to-2      Migrating to 2.0
```

28 pages. Sidebar groups: the three top pages ungrouped, then Essentials (open), Guides (open),
Realtime (collapsed), React Query (open), Reference (collapsed).

Top nav: Builder moves first, ahead of Server.

## What each page owns

Ownership is the rule that prevents repetition: a fact is stated on its owner page and linked
from everywhere else.

**Introduction** — What Builder is in three sentences; one compact example (declare → call →
the same declaration in a controller and in a hook, as three short tabs or blocks); who it is
for; a "where next" table mapping the reader flows to pages. Owns: the pitch. No install steps.

**Quick start** — Install; create the builder with a client; declare the example API (below);
call it; handle one failure with `.safe()`. Owns: installation, and the declaration of the
example API. Ends with two or three links, not a list of every page.

**How it works** — The model: a declaration is data plus a typed function; the call pipeline as
one diagram (validate input → bind URL → client → check status → validate response → result or
`EndpointError`); the two call forms (`endpoint()` throws, `endpoint.safe()` returns) and when
to pick each; where types come from (schema input types for arguments, output types for
results). Owns: the pipeline and the throw-vs-safe decision.

**Declaring endpoints** — `method`, `url`, and a map of every option as one line each with a
link to the page that owns it; `headers`, `timeout`, `clientOptions` (owned here);
`endpoint.config`; the type helpers `EndpointParams`, `EndpointResult`, `EndpointErrorType`,
`EndpointConfig`.

**URL params, query and body** — `$name` grammar and encoding, `urlParamsSchema` and its
declaration-time key check; `querySchema` / `params`; `requestSchema` / `data`; when the
arguments object and its parts are optional; per-call `headers`, `timeout`, `signal`. Replaces
three pages. Shows how Builder treats inputs, not how to write schemas.

**Responses** — `responseSchema`; per-status `responses`; the `response` kinds (`json`, `blob`,
`text`, `stream`, `void`) in one table; `validateResponse: false`; `ResponseMeta` and the
`getHeader` / `getCookie` / `getRetryAfterMs` helpers.

**Errors** — `EndpointError` and the table of kinds (the only copy on the site); narrowing in
`safe()` results; `errorSchema` and typed bodies; guards for `catch` blocks (`isEndpointError`,
`isHttpError`); `issues` and `cause`; the `onError` hook; `toJSON()`. Short patterns only where
Builder-specific (retry on `getRetryAfterMs`, ignore `aborted`).

**Schemas** — Standard Schema as the contract; input vs output types and
`InferSchemaInput` / `InferSchemaOutput`; mixing libraries per slot; async schemas; what a
validation failure looks like across libraries; a hand-written schema example. One short
"deriving request schemas from a base schema" example, then a link to Zod's docs. No Zod
catalogue.

**HTTP client** — The `Client` contract (resolve or reject, `response` on rejection, how
transport failures are classified); `@navios/http`, axios, a `fetch` wrapper;
`builder({ client })`, `provideClient`, `getClient`, `withClient`; the per-call
`{ client }` argument; auth headers and token refresh as client concerns, shown once.

**File uploads** — `body: 'multipart'`; how values are converted to `FormData`; validating
files in the schema; one plain example. React wiring links to the React Query page.

**Downloads and streams** — `response: 'blob' | 'text' | 'stream'` used for real tasks: save a
file, read a text reply, consume a stream. One browser snippet for saving a blob.

**Sharing with Navios Server** — The contract package pattern: declarations in a shared module,
imported by the client and by `@Endpoint(...)` controllers; `EndpointParams` from
`@navios/core` on the server (it is a different type from Builder's helper of the same name —
say so in one sentence);
what each side validates; the single callout about schema-library support on the server today.
Links to the Server controllers guide for the rest.

**Organizing an API** — File layout for declarations, one builder per backend, naming, exporting
types with the helpers, when to split by resource. This is the useful residue of the old Best
Practices pages, as a guide rather than a checklist.

**Testing** — A fake `Client` for unit tests; `withClient` / per-call `{ client }` to inject it;
asserting on `EndpointError` kinds. Only APIs that exist in the package.

**WebSocket** — `@navios/builder/socket`: `socketBuilder`, `defineSend`, `defineSubscribe`,
acknowledgements, Socket.IO vs native `declareWebSocket`, wire format, `SocketError` kinds.
Opens with a three-line "WebSocket or SSE?" comparison shared in wording with the SSE page's
opener but stated once in full here.

**Server-Sent Events** — `@navios/builder/eventsource`: `eventSourceBuilder`, `defineEvent`,
`declareEventSource`, the handle, `EventSourceError` kinds. Links to the WebSocket page for the
comparison.

**React Query → Quick start** — Install, `declareClient`, one query and one mutation in a
component, inline declaration vs passing an existing endpoint. Owns: React Query installation
and `declareClient`.

**Queries** — `use`, `useSuspense` (absorbs the Suspense page), options, `skipToken`, calling
the query for TanStack options, `select`, `withResponse`, cache helpers (`fetch`, `prefetch`,
`ensure`, `getData`, `setData`), POST queries.

**Infinite queries** — page params, `getNextPageParam`, `initialPageParam`, the helpers.

**Mutations** — the hook; settings; callback context and `useContext` (absorbs Mutation
context); `invalidates`; `mutationKey` and `useIsMutating` (absorbs Scoped mutations).

**Optimistic updates** — the `optimistic` setting, single and multiple targets, rollback and
settle flags.

**Keys and invalidation** — the key shape, the three scopes, `keyPrefix` / `keySuffix`
(absorbs Query keys, Invalidation and Query client config).

**Errors (React Query)** — Where the `EndpointError` appears (hook `error`, `onError`, error
boundaries); narrowing in a component. Links to Builder → Errors for kinds; does not repeat the
table.

**Uploads and downloads** — a multipart mutation and a blob query/mutation in React, including
the file-input wiring that was removed from the Builder pages.

**SSR and prefetching** — `prefetch` / `fetch` / `ensure` on the server, hydration,
`setHttpClient` / `getHttpClient` for per-request clients.

**Recipes: Forms, Realtime updates** — Forms is kept and trimmed. Realtime updates is rewritten
around what is specific to these packages: pushing socket / SSE events into the cache with
`setData` and `invalidate`. Polling gets one paragraph and a link to TanStack's docs. (Author's
call.) The
"Complete example" recipe is dropped; the two quick starts and the shared example API cover it.

**Reference: @navios/builder** — Every export with signature and a one-line description:
`builder`, `BuilderInstance`, endpoint options table, call arguments, `SafeResult`,
`EndpointError` and typed views, guards, response helpers, schema types, type helpers, client
types, low-level exports, then the socket and eventsource entry points. Tables and signatures;
examples only where a signature is not self-explanatory.

**Reference: @navios/react-query** — `declareClient`, query / infinite query / mutation object
members, mutation settings, other exports.

**Migrating to 2.0** — One page for both packages, before → after, sourced from the two
CHANGELOGs.

## Repetition rules

1. **One example API.** A small users-and-posts API runs through the whole section. Quick
   start declares only its core: the builder, `userSchema`, `getUser` and `createUser`. Each
   further endpoint (`listUsers`, `updateUser`, `deleteUser`, `listPosts`, `uploadAvatar`, ...)
   is declared once, on the page that owns the option it demonstrates. Other pages refer to
   endpoints by name; a page may redeclare one when the reader needs the option in context, but
   never the builder setup, imports or `userSchema`. (Author's call.)
2. **One owner per fact** (the list above). Before writing a paragraph, check whether another
   page owns it; if so, link.
3. **Tables of options and exports live in Reference** and on the single owner page
   (the error-kind table on Errors; the response-kind table on Responses).
4. **No boilerplate tails.** A page ends when its content ends. At most one "Related" line.
5. **Snippets show the delta.** Elide unchanged setup with a comment naming where it is
   defined (`// getUser from the Quick start`).
6. **React Query pages do not re-explain Builder concepts**; they link.

Direction, not an acceptance criterion: roughly half the current line count across the guide
pages, with no loss of documented capability. The Reference and migration pages are sized by
what they must list.

## Voice and format

- Second person, present tense, short paragraphs. State what happens, then show it.
- Each page opens with one or two sentences saying what it covers and when you need it.
- Code blocks use `ts` / `tsx`, `zod/v4` imports as the READMEs do, no semicolons, single
  quotes.
- Callouts only for things that bite (for example "nothing is sent when input validation
  fails").
- Page `title` frontmatter is the sidebar label; keep labels to one to four words.

## Redirects

Every current URL under `/docs/builder/` maps to its new home in `scripts/renamed-pages.mts`.
Pages that were merged redirect to the absorbing page; removed pages redirect to the closest
owner. The old "Custom handlers" content is rehomed, not dropped: the low-level exports
(`createHandler`, `bindUrlParams`, `makeConfig`) go to Reference, wrapping the client goes to
HTTP client, and transforming a response goes to Schemas as a schema transform. (Author's
call.) Mapping: (Overview → How it works; Best practices → Organizing an API; Discriminated unions →
Responses; Custom handlers → Reference; Complete example → React Query quick start; Query
client config → Keys and invalidation; Error schemas → React Query Errors). The two existing
entries are re-pointed to the new final targets so no redirect chains remain.

## Verification

- `yarn turbo run build --filter=<docs package>` passes: no dead links or anchors, and
  `check-urls.mts` reports every baseline URL resolving.
- `grep` across the new pages finds no removed 1.x names (`declareStream`, `declareMultipart`,
  `useDiscriminatorResponse`, `onZodError`, `isErrorStatus`, `processResponse`,
  `multipartMutation`, `queryFromEndpoint`).
- Every exported name used in an example exists in the package entry points.
- The sidebar is read top to bottom in the built site, light and dark, to check the order and
  labels.

## Left to the builder

- Exact wording, heading names inside a page, and which example endpoint illustrates a point.
- Whether Introduction uses tabs or stacked blocks for the three-context example, depending on
  what Rspress renders well.
- Whether the socket and eventsource reference is a section of the Builder API page or a
  separate reference page, depending on length.
- Order of work. Suggested: Builder pages first (they own the facts React Query links to), then
  React Query, then Reference, then sidebar / redirects / inbound links.
