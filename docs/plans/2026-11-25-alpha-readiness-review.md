# Navios 2.0: alpha readiness review

Two passes, both on 2026-11-25. The first reviewed `next` at `6103e58` and
fixed what it found on this branch (`d2479a3`). The second is a fresh review
of that result: six independent reviewers (di, core, server, adapters, builder
and http, jwt and schedule), every blocker reproduced before it was believed,
fixes written test first, then four more reviewers who attacked only the
changes of the second pass. This page starts with the second pass; the first
one follows unchanged as history.

Packages: `di`, `core`, `server`, `adapter-fastify`, `adapter-bun`, `jwt`,
`schedule`, `builder`, `@navios/http`. Others were only adapted where these
changed under them.

## Verdict after the second pass

Ready for a first alpha from the code's side. Every code blocker of both
passes is fixed and has a regression test. What is left is listed under "Open"
below; nothing in it, within the release set, is known to lose data, end a
process or open a route.

Versions are `2.0.0-alpha.0` in every package except `@navios/cli`. Nothing is
published. `yarn publish:next` publishes the set under the `next` tag;
`yarn publish:all` refuses a prerelease.

State of the branch, all uncommitted: `yarn build` passes (95 tasks: types,
lint, tests, the docs site), `yarn test:ci` passes (60 tasks), `check:size`
and `check:dts` pass. Tests: di 716, core 342, server 515, adapter-fastify
141, adapter-bun 142, builder 698, http 145, jwt 511, schedule 137. The packed
tarballs were installed into an application outside the workspace: every entry
point loads with import and require on Node 22, Node 24 and Bun, types check
under Node16, NodeNext and bundler resolution, and npm resolves one copy of
each package. Benchmarks are within the budgets of the 2.0 design: a plain GET
costs up to 0.3 µs over raw Fastify, a POST with three schemas 0.6 µs, a
request-scoped service 1.9 µs. The bundles grew (server 72 to 131 kB, di 59 to
83 kB, unminified); `size-check` has the new budgets. The CI workflow is
written and has not run.

## Second pass: blockers found and fixed

| # | Package | Problem |
|---|---|---|
| 1 | di, core, server | Legacy decorators: a subclass lost the guards, attributes and endpoints of its base class. A guarded base controller was served with 200 to anyone |
| 2 | jwt | A public key that did not parse (DER, an environment variable with literal `\n`, base64) was used as an HMAC secret: a forged HS256 token was accepted |
| 3 | jwt | `verify(token, { audience: undefined })` switched the configured audience, issuer or algorithm check off |
| 4 | server | Interceptors ran before guards; the cache interceptor printed in the docs served one user's response to others |
| 5 | adapters | `ctx.path` was not the path the router matched: an empty `Host` on Bun, or a percent-encoded path on Fastify, got past a guard that checks it |
| 6 | adapter-bun | JSON was parsed from `text/plain; application/json` and from a missing content type: CSRF without a preflight |
| 7 | server, adapter-fastify | A stream that was not read to its end was never closed: `HEAD` on an event stream ran its generator for ever, an aborted download leaked a file descriptor |
| 8 | server, builder | A rejecting async zod refinement in an optional or union branch ended the process |
| 9 | di, server | Un-awaited `ctx.resolve()` / `asyncInject()` ended the process once the request was over (a regression of the first pass) |
| 10 | di | `invalidate()` during a build deadlocked the container for good |
| 11 | di | `inject()` inside `InjectionToken.factory()` cached one request's value for every request |
| 12 | schedule | `close()` shut a running job's dependencies down before the job had ended |
| 13 | http | `application/problem+json` was not parsed, so every server error body was a string and no `errorSchema` matched |

The regression hunt over the second pass itself found and fixed four more
before they left the branch: any app bundled with esbuild crashed on import
(copy detection), an async transient holding an `asyncInject()` could not be
injected, aliases of async providers retried 33 times, and two modules
providing one token could not be resolved by the means the error named.

The second pass recorded 282 entries. Each has a spec here or is listed as
open below. The repro scripts were not kept.

## Decisions taken in the second pass

They were on the maintainer's list, or reverse something written down. Each is
easy to reverse now and expensive after the release.

1. **Guards run before the interceptors of a module, a controller or a
   handler.** Interceptors of the application (`app.intercept`, plugins) stay
   outside the guards, so tracing sees denied requests.
2. **The builder sends the caller's input**, not the schema's output.
   `builder({ send: 'output' })` is the 1.x behaviour, for third-party APIs.
   Defaults, stripping and transforms now run on the server.
3. **`@navios/schedule` is a transport** (`scheduleTransport()`,
   `@Module({ jobs })`); `schedulePlugin` is gone. Reverses call 12 of the
   kernel design. Overlapping runs are skipped by default.
4. **A path is fixed text and whole `$name` segments** on the server; anything
   else fails at `init()`. The builder still accepts mid-segment params.
   A declared url is kept verbatim after the prefix, trailing slash included.
5. **Provider precedence:** container, then the `providers` option, then
   plugins, then modules (importer before imported), then defaults.
6. **A signal ends the process** once the last application has closed
   (`enableShutdownHooks(signals, { exit: false })` opts out).
7. **jwt:** algorithms follow the key type; an empty or undefined key or
   option is an error at construction; `jsonwebtoken` stays, hidden behind own
   types and errors; EdDSA is not supported.
8. **Exact versions between packages** (`workspace:*`) while 2.0 is an alpha,
   so that a mixed set cannot be installed. Go back to `workspace:^` for 2.0.0.
9. **Adapters peer on `@navios/server` only** (and `fastify`).
10. **`@navios/server/adapter`** holds the adapter contract; about 60 internals
    left the main entries of di, core, server and builder.
11. **di** no longer resolves a class's dependencies ahead of its constructor:
    a class whose dependency is still initialising runs its constructor twice,
    on every build and not only the first. Waiting for a dependency this build
    might not ask for could hang or report a false cycle.
12. `publish:next` leaves out `cli`, `queues` and `microservice`.

## Open

- **ESM only.** Two copies of di or core (import and require) are detected and
  warned about, not prevented. Every supported Node has `require(esm)`, so
  dropping the CommonJS build would remove the problem. Decide before beta.
- **`create()` on a service.** `inject()` types a class with a zero-argument
  `create()` as a factory. Documented; a brand would fix it.
- **Deferred, all additive:** request timeout, pre-shutdown hook, two HTTP
  transports in one application, API versioning, rate limiting, urlencoded
  bodies, `@Interval`/`@Timeout` and dynamic jobs, JWKS helper, EdDSA,
  Socket.IO, EventSource/WebSocket reconnect, response codecs, SSE keep-alive,
  error classes and codes in core, shared CORS.
- **Bun:** a percent-encoded literal path (`/%73imple`) is 404; the idle
  timeout of 10 s applies to slow handlers and plain streams (Bun's default,
  documented); a stream of a few chunks is 4 to 8 % slower than in the first
  pass, about 0.5 µs, mostly for reading the client address while the response
  is open. One of 100 small chunks is 14 % faster. Before streams were written
  directly, that was 12 to 17 % and 29 % slower. Responses that are not streams
  do not pay for them: without any code for streams a JSON request costs the
  same (0.02 µs of 6), so there is no option to turn them off. The minimum is
  Bun 1.4.5: on 1.3.10 a stream is not held back for a slow client, also
  without Navios, and 12 of 90 conformance tests failed before this change.
  Versions between the two have not been tried. Files: `Bun.file()` as a `blob`
  is as fast as Bun itself; a `createReadStream` of 4 KB is 11 % slower, because
  the first chunk is read before the response is decided. **Fastify:** listening
  on `localhost` opens two servers and only one is drained; pass `host`. A
  `createReadStream` is 10 to 18 % slower than in the first pass, at every size,
  because its chunks go through the server's iterator and are no longer piped.
  Small chunks that are there at once are sent together on Node 24.22.1, but one
  by one on 24.11.0 and 24.13.0, which the minimum, Node 24, allows.
- **Packages outside the set.** `@navios/otel` still mixes OpenTelemetry 2.x
  and 3.x, whose peer ranges exclude each other (npm warns). `queues`
  consumers and the findings of the first pass on `openapi`, `adapter-xml`,
  `react-query` and `di-react` are as they were, except for `di-react`'s
  CommonJS entry, which loads now.
- **Docs site:** the `commander` section documents a package that is no longer
  here. `specs/` is 1.x text.
- **Slower on purpose:** a client-side schema that holds a function (`refine`,
  `transform`) validates 3 to 5 times slower than before, about 0.6 µs a row,
  because it may be asynchronous and a dropped rejection ends the process.
- **Not covered:** Deno, HTTP/2, Windows, PM2, real browsers and React Native,
  real message brokers.

---

# First pass

Reviewed `next` at `6103e58` on 2026-11-25. Packages: `di`, `core`, `server`,
`adapter-fastify`, `adapter-bun`, `jwt`, `schedule`, `builder` (with
`@navios/http` where builder depends on it).

## Verdict

Not ready to publish yet, but the code blockers are fixed on the branch
`fix/alpha-readiness` (uncommitted). What remains is a short list of
decisions only the maintainer can make (versions, dependency shape, a few
semantics), the adapter-parity design, and the state of the packages outside
the core release set.

State of the branch after the fixes: `yarn build` passes (94 tasks: check,
lint, tests), `yarn test:ci` passes (60 tasks, now including the four
`examples/e2e-*` suites), `check:size` and `check:dts` pass. 122 files
changed. Nothing is committed.

The sections below are the review as first written. Each finding that is now
fixed is listed under "Fixed on the branch"; everything else is still open.

How to read the evidence column:

- **repro**: a script reproduced it (scripts are in the session scratchpad,
  not in the repo).
- **re-checked**: I re-ran the repro or read the code path myself after the
  package reviewer reported it.
- **read**: found by reading the code; not executed.

## Fixed on the branch

Every fix has a regression test unless it is text or packaging.

**Blockers.** B1 (di stale plan args; I re-ran the original repro and each
scope now builds only its own tenant), B3 (void and 204 responses, with a new
e2e suite that runs builder against the real `@navios/http`), B4 (the Bun
body limit now holds for a chunked body the handler reads itself; the default
stays at Bun's 128 MiB by the maintainer's decision, so the two adapters
differ here on purpose). B2
(versions) is a release decision and is untouched.

**di** (479 tests). Cold-vs-warm constructor failure; transient-only cycles
report `CircularDependency`; `provide()` keeps a request-scoped token's
scope; transients of a failed construction pass are destroyed; lazy
`ctx.inject()` no longer grows the owner; `onInvalidate` unsubscribe leaves
nothing behind; a disposed scope rejects in-flight gets and destroys what was
built late; destroy-hook errors go to the logger; `inject()` outside a
construction is a `DIError`; `UnitTestContainer` proxy identity and
`#private`; plus one bug found on the way (`ctx.inject()` of a transient with
async init never resolved).

**core** (106 tests). `close()` returns the in-flight shutdown; a failed
`start()` stops the transports it started; module providers are applied
before the logger, transports and plugins resolve anything; module graph is
linear and puts inherited guards before a module's own; an `undefined` import
names its importer; a plugin registered twice with different options throws;
`envInt` falls back on `NaN`; every entry point registers the copy; a failing
signal-triggered close is reported.

**server** (219 tests). Stream `finally` runs when the body is never read; a
context used after an unreleased response throws instead of leaking; built-in
error mappings are no longer swallowed by `mapError(Error, …)`;
`HttpException` ≥ 500 is logged; a problem body cannot contradict the
response status; a failing error responder falls back to a 500 and still
releases; multipart schema conversion is cached; cookie jar and multipart
target have no prototype; SSE field injection; in-memory adapter query
arrays; a clear error for standard decorators applied as legacy ones; stale
split-era text.

**adapter-bun** (48 tests) and **adapter-fastify** (48 tests). Bun: query
keys no longer collide with `Object.prototype`; malformed multipart is 400;
`inject()` no longer throws on bad percent-encoding; `Vary: Origin` is sent
and appended correctly; a wildcard origin in a list with credentials is
rejected at construction; a stream is cancelled when the response cannot be
built. Fastify: capitalised `Content-Type` is kept; adapter-level 500s go
through the error pipeline; malformed multipart is 400; a multipart route
without the `multipart` option fails at startup; router errors answer as
problem+json; `fastify` is a peer only.

**builder** (471 tests) and **@navios/http** (26 tests). `.` and `..` URL
params are rejected; unparsable bodies keep their status; `timeout` works;
`params` merge into an existing query; string bodies and DELETE bodies are
sent; a WebSocket send before open fails immediately; `sideEffects: false`.

**jwt** (62 tests). Async `secretOrKeyProvider`; per-call keys beat instance
keys; `Buffer` and `KeyObject` in config; error classes usable as types;
`@types/jsonwebtoken` is a dependency; string payloads with default sign
options; security-path tests added (algorithm confusion, `alg: none`, clock
tolerance, RS256).

**schedule** (42 tests). Subclass metadata no longer leaks into the parent;
jobs keyed by `context.name`; an invalid expression registers nothing and
names the method; a tick can no longer produce an unhandled rejection; sync
methods accepted; a second `@Cron` on one method throws; `timeZone` option.

**Release plumbing.** `files` whitelists and the `navios-org` repository URL
in all nine packages (tarballs now contain `lib`, README, CHANGELOG, LICENSE);
the four example suites have `test:ci`.

### Behaviour changes made by the fixes that deserve a second look

- **di:** `provide(SingletonToken, TransientImpl)` now keeps the token's
  scope (singleton) unless a scope is given explicitly with
  `{ class, scope }`. An existing test asserted the opposite and was
  rewritten. This closes the scope-widening hole, but it is a semantic
  choice.
- **di:** a class whose dependency takes args and has async init now runs its
  constructor twice on every build, not only the first. The bundle is at
  59.4 kB of its 60 kB budget. The di and HTTP benchmarks were not re-run.
- **di:** a transient obtained through `ctx.inject()` after construction is
  untracked in the root container, so its `onServiceDestroy` is not called
  (same rule as a root `get` of a transient).
- **core:** on a shared module, the nearest attribute wins, then the
  outermost importer. One existing spec asserted the buggy guard order
  `[G1, G3, G2]` and now asserts `[G1, G2, G3]`.
- **adapter-bun:** for a body without `content-length`, `ctx.raw.request` is
  a copy of the request and lacks Bun's `params` and `cookies`.
  `applyCorsToResponse` now mutates the response it is given.
- **adapter-fastify:** bundle is at 11.8 kB of 12 kB.
- **jwt:** key precedence changed (per-call first); `signAsync` /
  `verifyAsync` now reject where they used to throw synchronously.
- **builder:** `handle.emit()` / `sendRaw()` on a WebSocket now throw.
- **@navios/http:** OPTIONS requests now send `data` too.

## Still open: decisions for the maintainer

1. **Versions and tags** (B2). Suggested: `2.0.0-alpha.0` everywhere, publish
   with `publish:next`.
2. **Dependency shape.** `core` and `di` as peers of `server`, or only `core`
   names `di`. Adapters peer on `core` and `builder` without importing them.
3. **Request decoding in server.** Content-type policy (Fastify 415 vs Bun
   accepts anything), `__proto__` in JSON bodies, mid-segment `$param`
   grammar (five regexes), multipart default and limits, one CORS
   implementation, `listen` option names. Nine conformance cases worth adding
   are listed in the adapter fix notes below.
4. **Interceptors before guards.** Keep and document loudly, or reorder.
5. **core:** teardown when `init()` fails; provider precedence (imported
   module beats root, plugin beats `options.providers`); ownership of
   `options.container`; process exit after a signal; a timeout on shutdown
   hooks.
6. **di:** a disposed root container is still usable; `ProviderConflict` is
   bypassed for same-named classes; ESM/CJS copies; `dispose()` resolving
   when a destroy hook threw; export pruning and renames.
7. **server:** trailing-slash URLs; validating thrown `HttpException` bodies
   against `errorSchema`; reporting mid-stream errors; `navios.core.*` brand
   symbols; pruning the main entry.
8. **builder:** client sends schema output and the server parses it again;
   Socket.IO envelope; type-level exclusions for conflicting options.
9. **jwt:** unused `Logger` injection; `jsonwebtoken` vs `jose`; default
   algorithm pin. **schedule:** overlap control, shutdown timeout, intervals.
10. **CI.** No workflow runs build or tests; `lint` scripts auto-fix instead
    of failing.

Conformance cases to add to `@navios/server` (from the adapter fixes):
prototype-named query keys; malformed multipart is 400; chunked body over the
limit read through `ctx.raw` is 413; capitalised `Content-Type` from an error
mapper is kept; an unwritable result is a 500 through the pipeline; `inject()`
and HTTP agree on malformed percent-encoding (today Bun 200, Fastify 400); a
stream with an unwritable status is cancelled.

## Blockers

| # | Package | Problem | Evidence |
|---|---|---|---|
| B1 | di | A cached construction plan stores the first build's **args** on the shared provider record and replays them in every later scope and container. A request-scoped `X(args)` that does `inject(Y, { id: args.id })`, where `Y` has an async `onServiceInit`, builds `Y{tenant-1}` again for tenant-2, tenant-3 and even a brand-new `Container`. `src/internal/resolution.mts:186-247` | repro, re-checked |
| B2 | release | Local versions equal versions already on npm `latest` (`di` 1.0.0, `core` 1.1.0, `adapter-bun` 1.1.0, `adapter-fastify`/`jwt`/`schedule` 1.0.0), so `publish` fails for those, while `builder` 2.0.0 and the new `server` 1.1.0 would go straight to `latest`. `workspace:^` would publish as `^1.1.0`, which no `2.0.0-alpha.N` satisfies. | re-checked (`npm view`) |
| B3 | builder + http | `response: 'void'` and `responses: { 204: null }` always fail with `@navios/http`: builder sets `responseType` only for blob/text/stream, the client defaults to `'json'` and calls `response.json()` on the empty body. The builder e2e tests use a mock client, so nothing catches it. `builder/src/http/make-config.mts:18-74`, `navios/src/client/create-navios.mts:21` | repro, re-checked by reading |
| B4 | adapter-bun | Body limit defaults to 128 MiB buffered in memory, and is not enforced for a chunked body unless the pipeline reads it (Bun's own check is disabled with `MAX_SAFE_INTEGER`). Fastify defaults to 1 MiB and answers 413. `adapter-bun/src/body-limit.mts:4`, `bun-adapter.mts:181`, `request-input.mts:77` | repro, re-checked by reading |

## Release plumbing (do in one pass)

1. **Versions.** Set every package in the release set to `2.0.0-alpha.0` and
   publish with `publish:next`. CHANGELOGs already say `2.0.0 - Unreleased`.
2. **Tarball contents.** No package has a `files` field. `server`,
   `adapter-bun`, `adapter-fastify`, `jwt` and `schedule` have no `.npmignore`
   either, so `yarn pack` ships `.turbo/*.log`, `src/__tests__`, tsconfigs and
   a stale `dist/` (1.x declarations for files that no longer exist). `di` and
   `builder` ship `coverage/`. Add `"files": ["lib"]` everywhere.
3. **Dependency shape.**
   - `server` has `core` and `di` as hard dependencies; `core` has `di` as a
     hard dependency; adapters, openapi, otel and microservice peer on them.
     Two copies of `di` split the container world silently (the default
     provider lives on the token object, identity is by class). Decide: peers
     throughout, or nobody but `core` names `di`.
   - `adapter-fastify` lists `fastify` as both dependency (`^5.12.8`) and peer
     (`^5.6.0`). Keep the peer only.
   - Adapters peer on `core` and `builder` without importing them;
     `adapter-bun` peers on `di`, `adapter-fastify` does not.
   - `jwt` exposes `jsonwebtoken` types in its `.d.mts` but
     `@types/jsonwebtoken` is a devDependency.
   - `server/conformance` imports `vitest` at runtime; declare it as an
     optional peer.
   - `builder` declares a `zod` peer that nothing imports, has no
     `sideEffects: false`, and builds with `platform: 'node'`.
4. **Metadata.** `repository.url` points at `Arilas/navios` in every package
   (the remote is `navios-org/navios`). No `engines.node` anywhere.
5. **CI.** The only workflow deploys docs. Nothing runs build or tests on a
   PR, and `lint` scripts run `oxlint --fix && oxfmt`, which rewrites files
   instead of failing.
6. **Examples are not in CI.** The four `examples/e2e-*` packages define
   `test`, not `test:ci`, so `yarn test:ci` never runs them. Design acceptance
   item 23 (legacy-decorator examples pass conformance) is therefore unchecked.
7. **Leftovers.** `packages/commander` is a README-only directory;
   `apps/docs/content/docs/commander` still documents `Registry`. `specs/`
   still shows HTTP imports from `@navios/core`. Root `dist/` and `src/` look
   like debris.

## Should fix before alpha

### @navios/di

| Problem | Where | Evidence |
|---|---|---|
| A constructor that *uses* an injected dependency with async init fails cold and succeeds warm (`db = inject(Db); t = this.db.table()`). | `internal/resolution.mts:296-336` | repro, re-checked |
| Transient-only cycles overflow the stack instead of `CircularDependency`. | `internal/resolution.mts:73-147` | repro, re-checked |
| `provide(RequestScopedToken, Mock)` silently makes it a singleton, so a singleton can inject it with no `ScopeMismatchError`. This is the pattern CLAUDE.md recommends for mocks. | `provider/provide.mts:63-96` | repro, re-checked |
| Scope disposal races with in-flight resolution: transients land in a disposed scope and are never destroyed; entries stay in a singleton's `dependents`. | `container/scoped-container.mts`, `internal/resolution.mts:456-520` | repro |
| Root `Container` has no disposed state: `get()` after `dispose()` silently rebuilds everything. | `container/container.mts:207-212` | repro, re-checked |
| Errors from `onServiceDestroy` are swallowed with no log. | `internal/destruction.mts:74-81` | repro, re-checked |
| ESM and CJS copies do not interoperate and nothing detects it (core has a single-copy warning; di has none). | `internal/resolution.mts:63` | repro |
| `ProviderConflict` is bypassed when two different classes share a `name` (minified or anonymous classes). | `provider/registration.mts:13-29` | repro, re-checked |
| `UnitTestContainer.get` returns a new Proxy each call and breaks `#private` members. | `testing/unit-test-container.mts` | repro, re-checked |
| "Every failure is a `DIError`" is false: `inject()` outside a construction throws a plain `Error`. | `internal/inject-impl.mts:28,38` | repro, re-checked |
| `@internal` members are in the published types (no `stripInternal`); dead exports (`EventEmitter`, type helpers, unused error codes, deprecated `endRequest()`). | `src/index.mts` | read |
| Naming to settle while breaking is free: `tryGetSync` (a peek), `FactoryNotFound` (means "no provider"), mixed `…Error` suffixes on codes, `decorate()` silently no-ops after first resolution while `provide()` throws. | various | read |

Leaks: `onInvalidate` unsubscribe leaves empty sets behind (1000 retained
after 1000 subscribe/unsubscribe, and `di-react` subscribes per component);
`ctx.inject()` called lazily from a factory product grows `owner.transients`
without bound; transients built during a failing construction pass are never
destroyed.

### @navios/core

| Problem | Where | Evidence |
|---|---|---|
| A second `close()` returns immediately instead of the in-flight shutdown, so `await app.close(); process.exit()` after a signal exits mid-drain. | `application/application.mts:358-362` | repro, re-checked |
| A failed `start()` leaves earlier transports running; `init()` failure does roll back, so the two disagree. | `application.mts:319-337` | repro, re-checked |
| A failed `init()` stops transports but does not dispose the container or run shutdown hooks; pools and timers keep the process alive. | `application.mts:193-202` | repro, re-checked |
| Module `providers` are written into `container.overrides` directly, after the logger is already resolved, so `provide(LoggerOutput, …)` in a module does nothing. | `application.mts:233-240` | repro, re-checked |
| Provider precedence is inverted: an imported module beats the root module, and a plugin's `api.provide()` beats `options.providers` (defeats test mocks). | `application.mts:234-288` | repro |
| `enableShutdownHooks()` swallows the signal and never ends the process; hooks have no timeout; a rejecting `close()` is an unhandled rejection. | `application.mts:342-351` | repro |
| `close()` disposes a container the application did not create (`options.container`). | `application.mts:80,406` | repro |
| A plugin registered twice silently drops the second options object. | `plugins/order-plugins.mts:9-14` | repro |
| Module graph walk is exponential on diamond imports (41 modules: 204 ms, doubling per layer) and appends a second importer's guards *after* the module's own. | `modules/module-graph.mts:56-99` | repro |
| Second-copy detection only runs from the `.` entry; a transport that imports only `@navios/core/transport` gets its own AsyncLocalStorage with no warning. | `internal/single-copy.mts` | repro |

Also: `asyncContext` is process-global and never turned off; `inject(Logger,
{ context })` with dynamic contexts grows the container (1000 contexts, 1003
instances); `envInt('abc')` returns `NaN`; no error classes or codes (plain
`Error('[Navios] …')` everywhere, while di has codes); HTTP vocabulary still
in the neutral contract (`HandlerInfo.controller`, `requestId`,
`requestScopedServices`).

### @navios/server

| Problem | Where | Evidence |
|---|---|---|
| A stream generator's `finally` never runs if the body is dropped before its first read (client disconnects between handler return and write). | `pipeline/compile-finalizer.mts:154-170` | repro, re-checked by reading |
| A request scope or `onFinish` first used *after* the result is sealed (detached work) is never released. | `pipeline/compile-route.mts:63-82` | repro, re-checked by reading |
| `mapError(Error, …)` swallows every built-in mapping: validation errors and `HttpException(404)` become whatever the catch-all returns. | `errors/error-pipeline.mts:57-123` | repro, re-checked by reading |
| Interceptors enter before guards, so a caching interceptor that answers without `next()` bypasses authorisation. Deliberate, but the reverse of NestJS, which the README names as the migration source. | `pipeline/compile-route.mts:130-165` | repro |
| A thrown `HttpException` ≥ 500 is never logged; errors mid-stream or mid-SSE are reported nowhere. | `errors/error-pipeline.mts:131-161` | repro / read |
| A thrown `HttpException` body bypasses the declared `errorSchema` (extra fields are sent; `reply()` strips them). | `errors/error-pipeline.mts:135-160` | repro |
| Multipart converts the schema to JSON Schema on every request. | `adapter/multipart-collector.mts:19-85` | repro |
| A declared URL with a trailing slash is registered without it, so the builder client gets 404. | `routing/join-paths.mts:7` | repro (in-memory) |
| The in-memory "reference" adapter is not run through the conformance suite and diverges (repeated query keys collapse, multipart not collected, no body limit). | `testing/in-memory-adapter.mts` | repro |
| Cookie jar and multipart target are plain `{}`: `ctx.cookies.get('constructor')` returns a function. | `context/request-context.mts:149,158` | repro |
| SSE encoder allows field injection through `\r` and raw `id`/`event`. | `sse/sse-message.mts:17-33` | repro |
| Split leftovers: `environment.mts:5` tells users to `declare module '@navios/core'`; brand symbols still say `navios.core.*` (renaming later breaks mixed versions); README lists `response: 'sse'`, which does not exist. | various | read |
| Main entry exports pipeline internals (`compileRoute`, `ErrorPipeline`, `GuardDeniedError`, `createMultipartCollector`…). Move to an adapter-author entry before the surface freezes. | `src/index.mts` | read |

### Adapters: parity

The same application behaves differently on Fastify and Bun in these places
(all reproduced against built `lib/` unless noted):

| Area | Fastify | Bun |
|---|---|---|
| Unknown content types (urlencoded, octet-stream, none) | 415 on every route, before guards | accepted: raw string, or JSON-parsed when missing |
| Body limit default | 1 MiB | 128 MiB (kept: Bun's own default) |
| Multipart | opt-in; a `body: 'multipart'` route without the option answers 415 at request time, no startup error | always on, no per-file/field/count limits |
| Query keys `__proto__`, `constructor` | plain strings | collide with `Object.prototype` (`request-input.mts:19-36`, re-checked) |
| JSON body with `__proto__` | 400 | accepted |
| Mid-segment params (`/files/$name.json`) | `{ name }` | `{ 'name.json' }`; `inject()` differs again |
| Over-long or badly encoded param, `//q` | 414 / 400 in Fastify's own JSON shape / 404 | 200 |
| `Content-Type` set with capitals in a result | overwritten by the kind default | kept |
| Adapter-level 500 | hard-coded problem, skips the responder and `exposeErrorDetails` | goes through the error pipeline |
| `onFinish` / scope release for buffered bodies | after the response finished | next microtask, before any byte is read |
| CORS | `@fastify/cors` semantics | own 282-line implementation: no `Vary: Origin` on mismatch, overwrites handler `Vary`, `origin: ['*']` + credentials throws per request |
| `listen` | `{ port, host }`, default port 0 | `{ port, hostname }`, default 3000 |
| Malformed multipart | 500 | 500 (both wrong; should be 4xx) |

The root cause is the same throughout: body decoding, content-type policy,
query parsing, CORS, the `$param` grammar and default content types are
implemented per adapter. There are five different `$param` regexes across
builder, server, both adapters and the test client. Moving these into
`@navios/server` and adding a conformance case for each row closes most of
the table in one design.

### @navios/jwt

Security basics hold: algorithm confusion and `alg: none` are rejected,
expired / not-before / invalid are distinguishable, all misconfigurations
fail closed. Gaps:

- `secretOrKeyProvider` is sync-only and receives the raw token, so JWKS or
  any remote key lookup is impossible (repro).
- Key precedence ignores the algorithm and per-call keys: instance `secret`
  plus per-call `publicKey` with RS256 throws; a provider silently overrides
  a per-call `secret` (`jwt-service.mts:270-286`, repro, re-checked by
  reading).
- `provideJwtService({ secret: Buffer })` and `{ publicKey: KeyObject }` fail
  schema validation though the per-call API accepts them (repro).
- Error classes are exported as `const`, so they cannot be used as types.
- No default algorithm pin; `Algorithm` includes `'none'`.
- An unused `Logger` injection is the only reason the package needs
  `@navios/core` and cannot be constructed with `new`.
- The single spec has no test for key providers, asymmetric keys, algorithm
  confusion or clock tolerance.
- Worth deciding now: `jsonwebtoken` is Node-crypto only (no EdDSA, no
  WebCrypto). `jose` would cover Bun/edge and async keys.

### @navios/schedule

Lifecycle is sound (jobs start at bootstrap, stop on close, one scope per
tick, errors logged, registry per container). Gaps:

- Cron metadata leaks across inheritance: a subclass's `@Cron` methods are
  added to the parent's job set (`cron-metadata.mts:15-20`, repro with
  simulated decorator calls, re-checked by reading).
- `@Cron` keys the job by `target.name`, not `context.name`, so a wrapping
  method decorator underneath breaks it (`cron-metadata.mts:33-38`).
- Shutdown waits for in-flight jobs with no timeout; a hung job blocks
  `app.close()` forever.
- No way to prevent overlapping runs; no `timeZone`; no `@Interval` /
  `@Timeout`; no `unregister`.
- An invalid cron expression leaves the service half-registered, and the
  second `register()` is a silent no-op.
- A scheduler resolved after bootstrap never starts, with no warning.

### @navios/builder (and @navios/http)

- `.` / `..` as a URL param traverses the path client-side:
  `/users/$id/profile` with `id: '..'` requests `/profile` (repro).
- The client sends the schema's *output* and the server parses it again as
  input, so any non-idempotent transform breaks the shared contract (repro
  client side, read server side). Decide: send the input, or support codecs.
- `@navios/http` silently drops builder options: `timeout`, a body on
  GET/DELETE, a string body, and `params` when the URL already has `?`
  (repro).
- A 200 with an unparsable body or a 500 with an empty JSON body is reported
  as `network`, with the status lost (repro).
- `declareWebSocket` swallows send failures; send-with-ack fails only after
  the 30 s timeout (repro).
- The Socket.IO quick start cannot work against a stock Socket.IO server
  (read; not run).
- Type-level holes: `responseSchema` with `responses`, `response: 'blob'`
  with `responseSchema`, `urlParamsSchema` keys that differ from the URL, all
  compile (repro with a type probe).
- `@navios/http` is 0.6.1 and is the recommended client for a 2.0 builder.

## Missing features

Present and working: guards, interceptors at four levels, error mappers and
problem+json, validation on by default, cookies, SSE, streams, multipart,
graceful shutdown, request-scoped DI and request values, in-process
`inject()`, plugins, prefixes.

Absent, roughly in the order users will ask:

1. Adapter-neutral client IP, host, protocol and URL on `RequestContext`
   (today only `ctx.raw`, and Bun's is `null` under `inject()`).
2. Raw body access (webhook signature verification).
3. urlencoded bodies on Fastify; CORS and body limit as transport options
   rather than adapter options.
4. 405 / `Allow`, and a stated HEAD / OPTIONS policy.
5. Request timeout; a pre-shutdown hook that runs before transports stop.
6. DI: multi-providers, eager graph validation, invalidate by token, a
   timeout on `dispose()`.
7. Schedule: time zone, overlap control, intervals.
8. API versioning, health endpoint, rate limiting, signed cookies, static
   files and compression on Bun. Reasonable to defer past alpha.

## Suggested order

1. B1 (di plan args) with a regression spec, plus the other di correctness
   items; they sit under everything else.
2. Release plumbing: versions, `files`, dependency shape, CI, examples in
   `test:ci`.
3. Core lifecycle: `close()` promise, `start()` / `init()` rollback, provider
   ordering and precedence.
4. One design for "request decoding lives in server": content types, body
   limit, query, params grammar, CORS, default content types. Extend the
   conformance suite with the parity table, and run it on the in-memory
   adapter. This closes B4 and most adapter rows.
5. Server correctness: stream cleanup, late release, error-mapper
   precedence, logging of 5xx and mid-stream errors.
6. B3 and the `@navios/http` gaps, with an e2e test against the real client.
7. jwt and schedule items; public-surface pruning and renames last, since
   they are mechanical.

## Packages outside the core release set

Reviewed after the first pass. Nothing here was changed.

### @navios/queues and @navios/microservice: hold or mark experimental

`queues` consumers are not ready. Producers and the DI layer are fine.

- RabbitMQ: one non-JSON message, or a channel closing mid-handler, raises an
  unhandled rejection in the consumer callback, which ends the process
  (repro). Every `publish()` / `send()` adds a permanent setup function to
  the channel wrapper: 51 setups after 50 publishes, all replayed on
  reconnect (repro).
- Kafka: a second `subscribe()` on one client throws, so an app with two
  handlers fails at start (read against kafkajs source). A failed handler
  loses the message; consumers created by `reply()` are never disconnected.
- SQS: every start creates a new subscriber queue and SNS subscription that
  are never deleted; poison messages loop (same message handled 14 times,
  repro); poll errors are swallowed.
- The `QueueClient` contract has no unsubscribe, no delivery metadata and no
  defined meaning for a rejected handler. This should change before any
  release, since it is the interface everything else depends on.
- All five broker drivers are `optionalDependencies`, so every install pulls
  them all.

`microservice` is small and coherent, but inherits all of the above. On
Kafka, a message arriving after `stop()` makes `app.close()` hang (repro
against a fake). Twelve exported decorators (`@Retry`, `@Idempotency`,
`@Ack`…) are stored and never acted on. Failures are logged nowhere. No
legacy-decorator entry.

Recommendation: do not include `queues` consumers in the alpha; ship
`microservice` only with an explicit experimental label, after removing the
no-op decorators from the root export.

### @navios/otel

- **Blocker:** the OpenTelemetry dependency set cannot satisfy its own peer
  ranges (`resources` / `sdk-metrics` 3.x need api `>=1.10 <1.11`,
  `sdk-trace-node` 2.12 needs `<1.10`, the package peers `<1.10`). A
  top-level `npm install --dry-run` of the set fails with ERESOLVE (repro).
- Decorating a subclass overwrites the parent's traced metadata, the same
  inheritance bug as schedule had (repro).
- The sampler ignores the caller's sampling decision (no `ParentBased`).
- Every 4xx marks the server span as ERROR; attribute names are the
  deprecated ones. Breaking to change later.
- Shutting down one app disables the global context manager for other apps
  in the process (repro).
- Metrics URL is derived by replacing `/traces` in the endpoint; `useHttp`
  is documented and never read.

### @navios/openapi

- A named schema (`.meta({ id })`) in a query, params or multipart slot loses
  its contents: no parameters are emitted (repro).
- The docs page imports Scalar from jsDelivr with no version and no SRI.
- Duplicate `operationId`s are emitted silently; none are generated.

### @navios/adapter-xml

- `<CData>` and `<DangerouslyInsertRawXml>` with more than one child join
  them with commas: `<CData>Hello {name}</CData>` renders `Hello ,World`
  (repro).
- `{true}`, a bigint, a `Date` or a component returning an array crash with
  an opaque TypeError.
- Characters illegal in XML 1.0 are emitted verbatim.
- `engines` says Bun only, though it runs on Node.

### Wrapper packages

`openapi-fastify`, `openapi-bun`, `otel-fastify`, `otel-bun` are 11 to 40
line re-exports. Recommendation: do not publish 2.0 alphas of them;
deprecate the existing releases on npm with a pointer.

*Done after the second pass:* the four packages are removed, and their tests on
the real adapters moved to `otel/e2e` and `openapi/e2e`. The releases on npm
are still to be deprecated.

### @navios/react-query

No blocker. Should fix:

- Two pending optimistic mutations on one entry: one settling wipes the
  other's optimistic value, and a rollback can restore a stale base (repro).
- Deterministic failures (a typed 404, a request-validation error) get
  TanStack's default three retries, about 7 s before `error` appears (repro).
- A caller-supplied `signal` replaces TanStack's, so `cancelQueries` and
  unmount no longer abort (repro).
- `userQuery.use()` is invisible to rules-of-hooks linting.
- The peer floor `@tanstack/react-query ^5.102.0` is unverified.

### @navios/di-react

- **Blocker:** the CommonJS entry points at `lib/index.cjs`, which the build
  does not produce (it emits `index.js`). `require('@navios/di-react')`
  fails (repro).
- `useSuspenseService` caches a rejection forever, and its cache never
  unsubscribes or evicts (5 mount cycles leave 5 listeners; repro).
- `useOptionalService` has an unguarded race on args change and decides
  `isNotFound` by substring-matching the error message (repro).
- First render reports `isLoading: false` with no data.
- A Suspense boundary outside `ScopeProvider` with a request-scoped service
  loops forever, creating scopes (61 in 300 ms; repro).

All of these packages also lack a `files` field and carry pre-2.0 versions.

## Documentation audit

Every snippet on the first-run path (server, di and builder index pages,
quick starts, essentials) resolves and type-checks, and every internal link
and sidebar entry is valid. The pages that the fixes on this branch made
stale, and a set of older inaccuracies in the server, di and builder
sections and four READMEs, are corrected on the branch (see the commit after
this report). Still open:

- **`examples/simple-test` is 1.x throughout**: 22 type errors in 8 of 15
  files, imports that no longer exist, and no turbo task touches it. Delete
  or rewrite.
- **The `commander` docs section** (14 pages, about 5,500 lines) documents a
  package that is no longer in this repository and presents DI 1.x
  (`Registry`, provider priorities, module `overrides`) as current.
  Recommendation: remove it from this site, with its nav, footer and sidebar
  entries and the root README row, and link to the commander repository.
- **Migration guides miss breaking changes** that the CHANGELOGs list.
  Server: the new adapter contract (1.x custom adapters and handler-adapter
  services are gone), not-found bodies are problem+json, `HttpException`
  extends `Error`, the `ExecutionContext` token and the legacy plugin shape
  are removed, `onModuleInit` runs imported modules first, `app.close()`
  disposes the container. DI: a factory is re-run when a dependency was still
  initialising, awaiting an `asyncInject()` promise in `onServiceInit` now
  fails with `CircularDependency`, `UnitTestContainer` auto-mocks with
  `allowUnregistered`. Builder: `clientOptions` can no longer override
  `method`, `url`, `params`, `data`, `signal`, `responseType`; several
  react-query signature changes. `@navios/http` has no migration section.
- **Undocumented:** `@navios/http` has no reference page and
  `@navios/http/testing` is documented nowhere; `app.start()`,
  `app.transport()`, `app.findTransport()` and the `transports` option are
  missing from the application page; `fakeTransport`; console logger options;
  `@navios/di/legacy-compat`; no minimum Node version is stated anywhere.
- **Stale repository URL** `Arilas/navios` in `apps/docs/rspress.config.ts`,
  the docs footer and home page, and in the `queues` and `microservice`
  manifests.
- **Install lines** name server and builder only, while the adapters also
  peer on `core` (and `di` on Bun) without importing them. Resolved by the
  dependency-shape decision above.

## Not covered

The performance acceptance table of the 2.0 design: benchmarks were not run,
before or after the fixes. Behaviour under Deno, TLS and HTTP/2. Real message
brokers and a real OTLP collector. React 18 at runtime.
