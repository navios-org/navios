# Navios 2.0: duplication and structure cleanup

Done on 2026-11-26, on the branch `refactor/v2-dedup-cleanup`: 113 commits on
top of `main` at `d34008f` (2.0.0-alpha.0). Everything listed here is in the
`2.0.0-alpha.1 - Unreleased` section of each package's changelog, which has
the full list of breaking changes.

## Why

The fixes made before the first alpha, and the ones that followed it, were
written against a deadline, one bug at a time. Several of them solved a problem
that another fix had already solved somewhere else, or left behind state that
a later fix made unnecessary. The kernel/server split also left copies of the
same plumbing in every transport. Because 2.0 is still an alpha, this cleanup
could break the API.

## How

1. Six read-only audits, one per group of packages (di; core; server; the
   adapters; builder, http and the React packages; jwt, schedule, otel,
   openapi, microservice, queues). They produced about 130 findings, and each
   one had to name its callers, as found by grep, before it counted. A
   token-based clone scan was run alongside: copy-paste is rare in this code,
   so almost all of the duplication was conceptual, the same job written twice
   in different words.
2. Two waves of changes in isolated worktrees, split so that no two changes
   touched the same files. Core's shared helpers went first, then the server,
   the adapters and the packages built on core.
3. Every finding that could change behaviour was implemented test-first.
   The DI and Fastify benchmarks were run before and after.
4. After each merge, every dependent package was checked. At the end, the CI
   sequence ran on the merged branch with `--force`.

Findings that are really decisions were not implemented. They are listed
under "Left for you".

## Result in numbers

| | Before | After |
|---|---|---|
| Non-test source, 16 packages | 46.3k lines | 44.3k lines (−2.0k) |
| Published JS, minified | 550.0 kB | 525.5 kB (−24.5 kB, −4.5 %) |
| Published JS, without comments | 741.9 kB | 706.2 kB (−35.7 kB) |
| Tests (vitest + bun) | 4,290 | 4,349 |

Per package, the published JS of all entry points, in kB:

| Package | Minified | Without comments | Raw (what `check:size` counts) |
|---|---|---|---|
| di | 81.2 → 76.0 | 111.8 → 102.8 | 124.4 → 116.1 |
| core | 62.4 → 62.0 | 84.9 → 84.4 | 97.6 → 98.8 |
| server | 163.2 → 163.2 | 222.9 → 224.0 | 236.1 → 238.5 |
| adapter-bun | 14.1 → 13.5 | 19.6 → 18.8 | 20.3 → 19.7 |
| adapter-fastify | 12.7 → 12.2 | 17.0 → 16.5 | 17.8 → 17.3 |
| adapter-xml | 8.2 → 7.7 | 10.1 → 9.5 | 14.2 → 13.7 |
| builder | 49.4 → 48.2 | 66.5 → 63.5 | 88.5 → 87.2 |
| http | 12.3 → 12.2 | 16.1 → 15.9 | 18.7 → 18.5 |
| react-query | 17.0 → 16.9 | 22.2 → 22.2 | 31.5 → 31.8 |
| di-react | 9.6 → 8.0 | 12.7 → 10.4 | 16.9 → 16.3 |
| otel | 24.5 → 18.5 | 31.8 → 22.9 | 46.1 → 34.7 |
| openapi | 18.7 → 18.8 | 24.2 → 24.3 | 27.7 → 28.5 |
| schedule | 13.3 → 12.0 | 19.6 → 17.8 | 26.0 → 24.1 |
| microservice | 9.0 → 5.8 | 11.8 → 7.7 | 13.1 → 9.4 |
| queues | 37.0 → 33.0 | 49.5 → 44.4 | 52.4 → 47.8 |
| jwt | 17.4 → 17.4 | 21.1 → 21.1 | 25.8 → 25.7 |

Why three packages did not shrink:

- **core** now holds the helpers that used to be copied into server, schedule,
  microservice and the adapters (`settledWithin`, `moduleClasses`,
  `classMetadata`, `executeChain`, `ownMetadata`/`requireMetadata`). It still
  ends up 0.4 kB smaller minified, while each of the packages that held a copy
  shrank. Its raw size grows by 1.2 kB anyway, because rolldown keeps the JSDoc
  of the new public helpers in the published JS.
- **server** runtime code is 1.4 kB smaller minified. It also took over
  `parseQuery` and the body-error helpers that both adapters had copied. The
  published conformance suite, `@navios/server/conformance`, grew by 1.4 kB
  with two new conformance tests (see "Bugs found"), so the total is flat.
- **openapi** is flat. The legacy attributes now share their argument shaping
  with the standard ones, and the main gain was fewer files (32 → 10).

`check:size` (raw output, comments included): di 86.6 of 88 kB, core 93.5 of
95 kB, server 134.3 of 138 kB, adapter-fastify 17.3 of 19 kB, adapter-bun 19.7
of 22 kB. No budget was changed.

## What changed, by kind

### One shared helper instead of three to five copies

| What | Was | Now |
|---|---|---|
| Wait for a promise, at most N ms | core, server, adapter-fastify, the in-memory adapter, schedule, microservice | `settledWithin` and `MAX_DELAY_MS` in `@navios/core/transport`, re-exported by `@navios/server/adapter` |
| The `HandlerInfo` of a handler | built by hand in server, microservice, and core's fake transport | `handlerChain()` returns `{ info, outer, inner }` |
| Classes a module lists for a transport | 4 versions, each with a different check | `moduleClasses(node, entry)` |
| Metadata stored on a class | 4 copies of `defineProperty` / `hasOwn` / "not decorated" | `classMetadata(key, what, decorator)` |
| Inherited decorator metadata | core, schedule and otel each had their own | `ownMetadata` and `requireMetadata` |
| Run a chain in an async context | microservice and the fake transport | `executeChain` |
| Resolve guards and interceptors | server had its own copy of core's `resolveChain` | server uses `resolveChain` |
| Legacy decorators | schedule and otel adapted them by hand | `legacy()` of the standard decorator |
| Query parsing and 413, incomplete-body and bad-path errors | Bun, Fastify and the in-memory adapter | `parseQuery`, `bodyTooLarge`, `incompleteBody`, `malformedPath` in `@navios/server/adapter` |
| "Are these two providers the same" | core read di's private record | `isSameProvider` in `@navios/di/internal` |
| Test containers of di | `TestContainer` and `UnitTestContainer` shared about 220 lines, which had drifted apart | an internal `TrackingContainer` base |
| WebSocket vs EventSource in builder | error classes, reporting, listener maps, connection setup and the validated subscribe were all written twice | `shared/realtime.mts`; both error classes are subclasses of one |
| `useService` and `useOptionalService` | about 80 % the same, and drifted (a race in one) | one internal `useResolvedService` |
| Queries vs infinite queries in react-query | the cache helpers were written twice | `attachCacheHelpers` |
| Request/reply in queues | the pending-request map three times (RabbitMQ, Kafka, SQS) | `PendingRequests` |
| Publisher, sender and requester in queues | one class written three times | one base class |
| Span lifecycle in otel | the HTTP interceptor, the handler interceptor and `@Traced` | `runInSpan` |

### Hotfix layering undone

- **server: a lazy body was primed twice.** `PrimedGenerator` primed
  generators before encoding, `ManagedBody` primed streams after it, and the
  first chunk was handed from one to the other. `ManagedBody` is now the only
  place where priming happens. The benchmarks are the same or slightly faster.
- **server: error fallbacks were stacked.** `ErrorPipeline` guarded every user
  call, and the route compiler wrapped it in two more try/catch blocks and a
  rejection handler. The pipeline now copes with hostile errors itself (a
  Proxy whose traps throw), and one guard is left.
- **server: one `ValidationError` was both a client error and a defect.** A
  check on `source === 'response'` sat in four places, and the docs asked
  every mapper to rethrow. `ResponseValidationError` is its own class now.
- **server: body ownership was written twice** and ran up to five times per
  request. There is one `ownResult` now.
- **server: an event stream was detected three ways**, and the three could
  disagree. It is decided once, in `encodeResponse`.
- **di: the construction plan** survived only to feed `leavingIn()`, since
  the pre-resolution it was built for was deleted. It is a list of tokens now.
- **di: `fromEarlierPass` re-derived what `resolve()` computes**, and
  validated a schema twice on a miss. It is folded into `resolve()`.
- **di: `ctx.inject()` had its own retry loop**, with a different restart
  rule from `get()`. There is one loop and one rule now.
- **di: disposed checks** were written in five places, with three ways to name
  the container. There is one predicate and one error now.
- **core: application state** that only repeated other state is gone:
  `TransportSlot.started`, the `closed` flag, the second `stopListening`, and
  an unreachable timer branch.
- **core and server: the scope check ran twice per `ctx.use()`** under the
  `warn` and `forbid` policies. It runs once now.
- **queues: the broker config schemas never parsed anything.** Their defaults
  were applied a second time with `??` in every client. The schemas are
  parsed when a client is resolved now.

### Pass-through layers and dead code removed

- **Barrels:** 45 folder `index.mts` files that only re-exported, in core (10),
  di (7), adapter-xml (7), otel (5), http, react-query and microservice (4
  each), openapi and schedule (2 each).
  Each entry now imports leaf files.
- **Wrappers:** otel's `TraceContextService` and `SpanFactoryService`;
  react-query's `EndpointArgs`,
  `EndpointData` and `EndpointFailure` (aliases of builder types); di's
  `injectors.mts`, the fake context of the legacy decorators, and
  `ProviderRecord.token`.
- **Unused API:** di's lifecycle records in `/testing` (they observed
  nothing); core's `isLogLevel` and twelve types
  that `/transport` exported a second time; server's `InMemoryAdapter`, `HttpGuard`/`HttpInterceptor`, and the adapter
  contract's `container`, `globalPrefix` and `name`; adapter-xml's
  `AsyncComponent` and internal node markers; microservice's twelve message
  attributes, which did nothing; queues' four abstract schemas; otel's
  plugin plumbing, which was exported but used nowhere else.

### Structure

- di's engine is split along its import cycle: a six-module cycle is now four.
  `construction.mts` and `resolution.mts` replace the old 683-line
  `resolution.mts`.
- server's adapter contract types live in `adapter/`, and the pure helpers sit
  next to their kind.
- otel went from 43 source files to 19, openapi from 32 to 10.
- `get()`/`getSync()` of the containers are prototype methods, saving two
  closures per scope. `createScope` + `dispose` went from 29 to 22 ns.

## Bugs found and fixed

Each one has a regression test that failed before the fix.

| Package | Bug |
|---|---|
| adapter-xml | The published package lacked the `./jsx` types: `jsx.d.ts` was outside `files`. `yarn check:pack` now catches this for every package, and it runs in CI. |
| adapter-xml | A promise child of arrays, or an array returned by a component, threw a `TypeError`. A `true` child threw. `defineTag` dropped a `0` child. |
| builder | Unsubscribing the last handler of an SSE event left its listener on the client, and `provideClient` attached it again. |
| builder | An object in a WebSocket or EventSource query was sent as `[object Object]`. |
| di-react | `useOptionalService` could show a stale instance after its args changed. `refetch()` after a failure lost invalidation. `useSuspenseService` cached a rejection for good. |
| di | `isRegistered()` and `optional()` did not follow an alias to its end. Legacy `@Injectable` on something other than a class registered it silently. |
| core | A schema that answered with a non-native thenable passed as valid, with the value `undefined`. |
| server, adapter-bun | An `HttpException` thrown by a CORS origin function was a 500 on Bun and its own status on Fastify. |
| adapter-bun | The CORS origin function ran twice for a refused preflight. A generator that declared `text/event-stream` itself had its headers held back until the first event. |
| server | A hostile error object (a throwing Proxy) went unreported, and `unexpected()` threw. |
| otel | An undecorated subclass of a traced class was traced with its parent's settings. `@Traceable` on a subclass dropped the parent's span name and attributes. |
| jwt | A configuration function of `provideJwtService` that returned a thenable other than a native promise resolved the service to `undefined`. |
| queues | Kafka's retry `factor` rejected its own default. A RabbitMQ request whose publish failed waited 30 s and left an unhandled rejection. A queue named `toString` counted as configured. |

## Behaviour changes you may notice

- **di-react:** the first render reports `isLoading: true` when no instance
  is available yet. `useService` reports a `peek()` failure in `error` instead
  of throwing.
- **di:** `ready()` also waits for background cleanup.
  `const { get } = container` loses its `this`.
- **server:** `mapError(ValidationError)` no longer receives response
  validation failures; those are `ResponseValidationError`. A mapped result
  that cannot be encoded is answered with a plain `problem(500)`.
- **adapter-bun:** a generator that sets `text/event-stream` itself gets the
  `:\n\n` opening, as `sseStream` does.
- **otel:** span and resource attributes use the stable semantic conventions:
  `http.request.method`, `url.path`, `user_agent.original`,
  `http.response.status_code`, `code.function.name`,
  `deployment.environment.name`.
- **queues:** an invalid config entry or an empty topic throws when the client
  is resolved. `onServiceInit` is `connect()`.

## Changes made, then undone

- **The split of `Application` into three classes (CORE-4) was reverted.** It
  was meant to break up the 797-line `application.mts`, but it removed no
  duplication. Instead it added `ProviderPrecedence`, `ApplicationLog`, an
  object of closures to hand state across files, and 1.3 kB of minified
  output, which surfaced as core nearing its size budget. With the revert,
  two small merges inside it went too: the `logger` option is read once, and
  the two settle functions share a configure step. They can be redone inside
  `application.mts` if wanted.
- **jwt and schedule keep reaching di through core.** The audit proposed that
  jwt peer on `@navios/di`, since the container is all it uses, and that
  schedule import `constructedInstances` from `@navios/di/internal` with a di
  peer of its own. Both were done and undone. A server application does not
  list di, so the peer would warn as unmet, and a strict install could give
  the package a second copy of di, with its own decorators and metadata, from
  the one core uses. A package built for core or server apps imports di's API
  through `@navios/core`, and `@navios/core/transport` keeps re-exporting
  `constructedInstances` for that reason. otel, which peered on di and
  imported it in 12 files since before this cleanup, was switched the same
  way: it imports the container through `@navios/core` and no longer peers on
  di.
- **Six removals of public API were restored in review.** They were removed
  as pass-through or unused inside the repository, but an application has a
  use for each:
  - builder's `getHeader(meta, name)`. It is the null-safe reader that
    `getCookie`, `getRetryAfterMs` and `getFilename` sit next to, and without
    it the docs had to show `res.response?.headers.get(name) ?? null` in the
    middle of the helpers.
  - builder's `api.withClient(client)`. `builder({ ...config, client })` needs
    the config, which code that is handed a builder does not have.
  - builder's types `EndpointOptions` and `InferErrorSchemaOutput`. No
    signature of the package uses them, but they are for signatures of the
    application, and the 1.x migration page points to `EndpointOptions`.
  - core's `ConfigServiceInterface`. `ConfigService` has a private field, so
    a fake or another implementation cannot be typed as the class.
  - server's default responder classes. A responder that replaces a token
    cannot inject the default it replaces, so extending the class is the only
    way to keep the default response and change part of it.

  The size and test tables above were measured before this; builder has 3
  tests more, and the published sizes of builder and server are a few hundred
  bytes larger. `check:size` passes: core 93.6 of 95 kB, server 134.6 of
  138 kB.
- **Bun's `upgraded.has(request)` check was restored.** It was dropped as
  redundant with `takenOver`. However, a handler that upgrades and then throws
  never sets `takenOver`, and without the check its error response would go
  to Bun after the upgrade. Bun ignores it today, but does not promise to.

di's new internal helpers are documented with `//` comments, as di's existing
internal helpers are. Rolldown keeps `/** */` blocks in the published JS and
drops `//` comments, and di's budget counts the difference.

## Left for you

These were found but not changed, because each one is a decision rather than
a cleanup.

1. **One CORS implementation.** This is the largest duplication left. Bun has
   its own 176-line `cors.mts`. Fastify uses `@fastify/cors` and evaluates it
   a second time, against a fake instance, to get its hook for router errors.
   Making CORS an `httpTransport` option, answered in the server's executors,
   would remove both and the conformance suite already describes the
   behaviour; but the adapters' `cors` options would move.
2. **Two Zod "may this be async" scanners.** Server's `zod-schema.mts` (175
   lines, Zod 4 only) and builder's `zod.mts` (192 lines, Zod 3, Zod 4 and
   Mini) follow different rules. They also disagree on a schema that throws:
   builder counts it as a failed validation, server as a 500. Sharing one
   needs that decision and a shared conformance test.
3. **`headersSchema` and `cookiesSchema`** are validated by server, Fastify
   and openapi, but no builder option produces them. Either add them to
   builder, typed, or remove them.
4. **`errorSchema` is checked two ways.** `reply(4xx)` respects
   `validateResponses`, and a mismatch is a 500. A thrown `HttpException` is
   always checked, and a mismatch sends `problem(status)`.
5. **Server's test client re-implements builder's request encoding.** The
   rules already differ: `toJSON` handling, and empty URL params.
6. **builder:** JSON-encode every body in builder rather than in the client,
   which would remove the `serializationError` heuristic. There are also two
   ways an ack arrives in envelope mode; unifying them breaks custom clients
   that emit `__navios_ack:` events.
7. **di:**
   - drop the pre-wait for a dependency that is being destroyed (DI-3b);
   - give the test containers one provider vocabulary (`provide()`,
     `{ useValue }` and `bind().toValue()` all exist);
   - choose one rule for `get()` from a destroy hook (a scope refuses it, the
     root allows it).
8. **core:** HTTP words in the transport-neutral kernel: `HandlerInfo.controller`,
   `requestScopedServices`, `ConsoleLoggerOptions.requestId`. Rename them now
   or keep them for good.
9. **The size budget counts comments.** `check:size` measures unminified
   output with JSDoc, so documenting a public helper costs budget. Measuring
   minified, or comment-free, output would track code.
10. **`application.mts` is still about 800 lines.** If it should be split,
    plain functions over its state would cost less than the reverted classes.

## Follow-ups

- queues: the three SQS poll loops are still near-copies, and Kafka and SQS
  have no tests.
- `@navios/openapi/legacy-compat` re-exports tokens, types and
  `generateOpenApiDocument`, which its docs do not list.
- adapter-xml: a child that is a plain object, such as a `Date`, type-checks
  and then throws a bare `TypeError`. `xml.md` does not mention promise
  children.
- Twelve local branches of the agents (`worktree-agent-*`,
  `refactor/react-query-cleanup`, `refactor/di-react-cleanup`) are left over.
  Their commits are on this branch.

## Verification

On the merged branch, the CI sequence passes:

- `yarn build --force`: 80 of 80 tasks; this covers type checks, lint, tests
  and the docs site.
- After the build, `git diff --exit-code` passes, so lint changed nothing.
- `yarn test:ci`: 56 of 56 tasks.
- `yarn check:size`, `yarn check:dts` and the new `yarn check:pack` pass.

Tests by package:

| Package | Before | After |
|---|---|---|
| di | 728 | 734 |
| core | 342 | 351 |
| server | 524 | 530 |
| adapter-fastify | 143 | 145 |
| adapter-bun | 144 | 147 |
| adapter-xml | 85 + 49 | 97 + 49 |
| builder | 752 | 753 |
| http | 145 | 146 |
| react-query | 127 | 128 |
| di-react | 79 + 1 skipped | 93 |
| jwt | 511 | 513 |
| schedule | 137 | 139 |
| microservice | 19 | 20 |
| queues | 18 | 39 |
| openapi | 134 | 141 |
| otel | 108 | 79 |
| e2e examples | 52 + 52 + 55 + 55 | the same |

otel lost 34 tests together with the code they covered and gained 5. Builder
gained 4 for the bugs above.

Benchmarks:

- **di:** unchanged or faster. A ready singleton is 0.014 µs sync and
  0.055 µs async; `createScope` + `getSync` + `dispose` went from 0.221 to
  0.219 µs.
- **Fastify:** unchanged within noise. GET is 7.66–7.81 µs, POST 23.1–23.6 µs,
  a request scope 9.0–9.4 µs, all through `inject()`.
