# Navios 2.0 Phases 2 to 4: core pipeline, adapters, handlers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `@navios/core` one compiled, adapter-neutral request pipeline with a typed `RequestContext`, rewrite both HTTP adapters on top of it, and make `@Endpoint` / `handler()` the only handler forms.

**Architecture:** Core compiles each route into a `RouteExecutor` (`RouteInput → RouteResult`). Adapters register routes, build a `RouteInput` per request and write the `RouteResult`. Guards, interceptors, validation, error mapping and response validation live only in core. Controllers, guards and interceptors are singletons; per-request state is context keys and request values, with a lazily created DI scope behind `ctx.use()`.

**Tech Stack:** TypeScript, Vitest, tsdown, Yarn + Turbo, `@navios/di` 2.0 (phase 1), `@navios/builder`, Fastify 5, Bun.

**Spec:** [`2026-11-24-navios-2-0-framework-design.md`](./2026-11-24-navios-2-0-framework-design.md), sections 6, 7, 8, 9, 11. Phases 2, 3 and 4 of its section 12 are planned together because core cannot be exercised end to end without an adapter, and an adapter cannot be written against the old handler decorators.

## Global Constraints

- Branch `feat/v2-core`, based on `feat/v2-di`.
- `yarn`; per package `yarn run -T vitest run`; lint with `yarn turbo run lint --filter=<package>`.
- `.mts`, no semicolons, single quotes.
- No decorator syntax in non-test sources of `core`, `adapter-fastify`, `adapter-bun` (`registerInjectable`).
- No runtime import of `zod` in those three packages. Schemas are `StandardSchemaV1` from `@navios/di`.
- No `any` in the public types of `RequestContext`, `Guard`, `Interceptor`, handler signatures.
- Stage order in every executor: context → interceptors enter → guards → validate url params, query, headers → read and validate body → handler → validate reply → interceptors exit; any throw → error mappers.
- Error bodies: `application/problem+json` unless the endpoint's `errorSchema` declares the status. Internal error text is hidden unless `exposeErrorDetails: true`.
- `validateResponses: 'always' | 'development' | 'never'`, default `'always'`.
- Performance budget against raw Fastify in the same run (design section 11): GET no guards ≤ +1 µs; POST with schemas ≤ +1 µs; one guard ≤ +1.5 µs; one request value ≤ +1.3 µs; one request-scoped service ≤ +3 µs.
- Downstream packages (`otel*`, `openapi*`, `adapter-xml`, `schedule`, `queues`, `microservice`, `jwt`) are phase 6 and may not build on this branch.

## Review Focus

1. A handler that throws after the client disconnected must not write to a closed response or leak the request scope. Test in Task 6 (both adapters).
2. A guard that throws a non-`HttpException` error must produce a 500 problem response without the error text, and must not run the handler. Test in Task 3.
3. A request to a route with a body schema but an unparseable JSON body must be a 400 validation response, not a 500. Test in Task 6.
4. A request value whose `resolve` rejects must reject every concurrent reader once and must be retried by a later request, not cached on the provider. Test in Task 2.
5. Two routes with the same method and path must fail `init()` naming both handlers. Test in Task 5.

## File Structure (`packages/core/src`)

| Path | Responsibility |
|---|---|
| `context/context-key.mts` | `ContextKey`, `createContextKey`, `@RequestValue`, `registerRequestValue`, `ContextValue<K>` |
| `context/request-context.mts` | `RequestContext` class, `RequestContextToken`, headers and cookies views |
| `routing/types.mts` | `RouteInfo`, `RouteInput`, `RouteResult`, `RouteExecutor`, `CompiledRoute` |
| `routing/validation.mts` | `validateSchema`, `ValidationError` |
| `routing/compile-route.mts` | `compileRoute` |
| `routing/encoders.mts` | response kinds and the encoder registry |
| `errors/*.mts` | `HttpException` family, error mapper registry, problem responders |
| `guards.mts`, `interceptors.mts` | `Guard`, `Interceptor`, `UseGuards`, `UseInterceptors` |
| `decorators/*.mts`, `handler.mts` | `Controller`, `Module`, `Endpoint`, attributes; the field form |
| `metadata/*.mts` | controller, module and handler definitions |
| `application/*.mts` | `NaviosFactory`, `NaviosApplication`, module graph, lifecycle, plugins |
| `adapter/http-adapter.mts` | `HttpAdapter`, `AdapterDefinition`, `Register`, `RegisteredEnvironment` |
| `testing/*.mts` | `TestingModule`, `createTestClient`, the in-memory adapter |

---

### Task 1: Validation, errors, encoders

**Produces:**
```ts
class ValidationError extends Error { issues: StandardSchemaIssue[]; source: 'urlParams' | 'query' | 'headers' | 'cookies' | 'body' | 'response' }
function validateSchema(schema: StandardSchemaV1, value: unknown, source): unknown | Promise<unknown>   // sync when the schema is
class HttpException extends Error { statusCode: number; response: string | object }
// + BadRequest(400) Unauthorized(401) Forbidden(403) NotFound(404) Conflict(409) UnprocessableEntity(422) TooManyRequests(429) InternalServerError(500)
interface RouteResult { status: number; headers?: Record<string, string>; cookies?: SetCookie[]; body: unknown; kind: ResponseKind }
type ResponseKind = 'json' | 'text' | 'blob' | 'stream' | 'empty' | (string & {})
class ErrorMappers { add(errorClass, mapper): void; map(error, ctx): RouteResult }
```
- [ ] Tests: sync schema validates without a promise; async schema returns a promise; issues become `ValidationError` with the source; `HttpException instanceof Error`; mapper precedence (most specific class, then `HttpException`, then `ValidationError` → 400 problem, then 500 problem with hidden detail); `exposeErrorDetails` shows the message.
- [ ] Implement, commit.

### Task 2: Request context, context keys, request values

**Produces:** `RequestContext` (design 6.1), `createContextKey<T>(name)`, `@RequestValue()` / `registerRequestValue(Class)`, `RequestContextToken`, `ctx.use` / `ctx.resolve`, `ctx.raw`, `Register`.
- [ ] Tests: `get` of an unset key throws naming the key; `set` then `get`; a request value resolves once under concurrent `get`, not at all when unread; `set` pre-fills a request value; a cycle between request values throws with the path; `dispose` hooks run in reverse order on `ctx.dispose()`; `ctx.use()` creates the scope on first call only and `ctx.dispose()` disposes it; `inject(RequestContextToken)` inside a request-scoped service returns the context; Review Focus 4; type test for `ctx.raw` with and without `Register`.
- [ ] Implement, commit.

### Task 3: Guards, interceptors, route compilation

**Produces:**
```ts
interface Guard { canActivate(ctx: RequestContext): boolean | Promise<boolean> }
interface Interceptor { intercept(ctx: RequestContext, next: () => Promise<RouteResult>): Promise<RouteResult> | RouteResult }
function compileRoute(definition: RouteDefinition, deps: CompileDeps): RouteExecutor
```
- [ ] Tests against a fake `RouteInput` (no adapter): stage order recorded by spies; guard `false` → 403 problem; guard runs before `body()` is called; body is never read when a guard denies; invalid query → 400 with issues; `reply(201, body)`; undeclared status → 500; `errorSchema` status body sent verbatim; `response: 'void'` → 204 empty; response validation strips unknown fields and a violating body → 500; `validateResponses: 'never'` skips; interceptors wrap in order and can replace the result; error mapper result; Review Focus 2; a route with no guards, interceptors or schemas returns the handler's promise with at most one extra layer.
- [ ] Implement, commit.

### Task 4: Decorators, `handler()`, metadata, attributes

**Produces:** `@Controller({ guards?, interceptors? })`, `@Module({ prefix?, imports?, controllers?, guards?, interceptors?, providers? })`, `@Endpoint(declaration)`, `handler(declaration, options?, fn)`, `@UseGuards`, `@UseInterceptors`, `AttributeFactory` on Standard Schema, `HandlerParams<E>`, `HandlerResult<E>`, `reply()`.
- [ ] Type tests: field form infers params and rejects a wrong return; method form checks the signature; `reply()` accepts declared success and error statuses only; `response: 'stream'` requires a stream return.
- [ ] Runtime tests: metadata for both forms is identical; attributes on class, method and field.
- [ ] Delete `@HttpCode`, `@Header`, `@Multipart`, `@Stream`, `zod-endpoint-options.mts`, the handler-adapter services, factories and tokens. Port `legacy-compat` as thin wrappers.
- [ ] Commit.

### Task 5: Application, modules, lifecycle, plugins, testing

**Produces:** `NaviosFactory.create(AppModule, { adapter, providers?, plugins?, logger?, validateResponses?, exposeErrorDetails?, asyncContext?, requestScopedServices?, shutdownTimeout? })`, `app.init()`, `app.listen()`, `app.close()`, `app.routes()`, `app.mapError()`, `app.intercept()`, `app.enableShutdownHooks()`, `definePlugin({ name, dependsOn?, setup })`, `HttpAdapter`, `AdapterDefinition`, the in-memory adapter, `createTestClient(app)`, `TestingModule`.
- [ ] Tests with the in-memory adapter: module graph (prefix composition, transitive guard union, no cross-application leak); a controller that injects a request-scoped service fails `init()` with the path; `requestScopedServices` `'warn'` and `'forbid'`; lifecycle order on `close()` including `onServiceDestroy`; plugin ordering by `dependsOn`, `usePlugin` after `init()` throws; `app.routes()`; Review Focus 5.
- [ ] Commit.

### Task 6: Adapters and conformance

- [ ] `packages/core/src/testing/conformance.mts`: a suite function `runConformance(name, createAdapter)` covering guard order, validation order, response validation, error bodies, streams, multipart, SSE, shutdown, Review Focus 1 and 3.
- [ ] Rewrite `@navios/adapter-fastify` (`defineFastifyEnvironment({ cors?, multipart?, ...fastifyOptions })`) and `@navios/adapter-bun` against `HttpAdapter`; each runs the conformance suite.
- [ ] Port `examples/e2e-*` and their e2e suites.
- [ ] Commit.

### Task 7: Builder additions, benchmark

- [ ] `@navios/builder`: `headersSchema`, `cookiesSchema`, in-process transport hook.
- [ ] `packages/core/benchmarks/http.bench.mjs` with the budgets from Global Constraints; record results below.
- [ ] Commit.

## Results

Executed 2026-11-24 on `feat/v2-core`.

**Done:** Tasks 1 to 6, the benchmark half of Task 7, typed server-sent events (`sse()`, `sseStream()`), and all four example applications (52 tests in each Fastify example, 55 in each Bun example).

**Import time:** `import('@navios/core')` takes 16 ms (was 35 ms; budget 20 ms).

**Tests**
- `packages/core`: 103 passing, type tests clean (pipeline kernel, application on the in-memory adapter, legacy-compat, handler types).
- `packages/adapter-fastify`: the 13 conformance tests and 1 native-reply test pass (Vitest, real HTTP).
- `packages/adapter-bun`: the same 13 conformance tests pass under `bun test`, plus 2 CORS tests.

**HTTP benchmark** (`yarn bench --check` in `packages/adapter-fastify`; Node 24.22, production mode, `fastify.inject`, best of 7 rounds, same machine as the 1.x numbers). The baseline is raw Fastify doing the same zod validation by hand.

| Case | Raw Fastify | Navios 2.0 | Overhead | Budget | 1.x overhead |
|---|---|---|---|---|---|
| GET, response schema | 7.40 µs | 7.38 µs | about 0 | +1.0 µs | +2.7 µs |
| POST, query + body + response schema | 23.14 µs | 23.40 µs | +0.26 µs | +1.0 µs | +1.7 µs |
| GET with one guard | 7.40 µs | 7.61 µs | +0.21 µs | +1.5 µs | +3.5 µs |
| GET reading one request value | 7.40 µs | 7.99 µs | +0.59 µs | +1.3 µs | n/a |
| GET using one request-scoped service (2 deps) | 7.40 µs | 8.70 µs | +1.30 µs | +3.0 µs | +16.8 µs |

Run-to-run variation is a few tenths of a microsecond, so "about 0" means within noise.

**Output size (ESM):** `core` 78 KB (was 298 KB), `adapter-fastify` 8 KB (was 110 KB), `adapter-bun` 15 KB (was 97 KB). No decorator helper and no `zod` in any of them.

**Not done**
- `@navios/builder` `headersSchema` / `cookiesSchema` and the in-process transport (Task 7). Core already validates `headersSchema` and `cookiesSchema` at runtime when a declaration carries them, but the builder rejects unknown options, and the client-side meaning of a headers schema is a builder design decision. `createTestClient` is therefore a small typed wrapper over `app.inject()`, not the builder client.
- `TestingModule` / `UnitTestingModule` were removed and not replaced. Tests use `defineInMemoryEnvironment()`, `createTestClient()`, `app.inject()` and the DI test containers.

**Deviations from the design, recorded in the design doc**
- `requestScopedServices` is enforced at the first `ctx.use()` of a token, not at `init()`.
- Cycles between request values are detected for synchronous reads only.
- `RouteInput` accessors are functions and `RouteResult` has `release`, so that nothing is computed or allocated unless used.

**Found while executing**
- A benchmark loop that only awaits `fastify.inject()` never lets the event loop turn, and memory grows until Node aborts. It looked like a request-scope leak and was not one (retained heap after a forced GC: 15 MB after 60,000 scoped requests). The benchmark now yields between rounds.

**Found by porting the examples and writing the docs, all fixed with tests**
- Multipart: a single part for an array-of-files field was rejected, because the JSON Schema request failed on file types.
- Headers set inside an async-generator stream handler were dropped; the generator is now run to its first chunk before the response is sealed.
- A string `HttpException` on a status declared in `errorSchema` was sent as a bare string body.
- `handler()` options rejected legacy-compat attributes at the type level.
- A handler that wrote through the native Fastify reply got its (absent) return value validated; core now skips validation when the adapter reports the response as sent.
- The Fastify adapter did not drop connections when the shutdown timeout passed.
- The in-memory adapter answered a malformed JSON body with 500 instead of 400.
- Bun CORS: no origin meant no CORS at all, and `credentials` with a wildcard origin threw on every request. The origin now defaults to `*`, and the invalid combination fails at start-up.
- Thrown `HttpException` bodies are now checked against `errorSchema` outside production and a mismatch is logged.

## Phase 6: downstream packages

Executed 2026-11-24 on the same branch. The whole repository passes `yarn turbo run check test:ci lint build` (86 of 86 tasks), `yarn check:size` and `yarn check:dts`.

| Package | Result |
|---|---|
| `jwt` | Ported; no zod. 30 tests. The exported zod schemas were removed. |
| `schedule` | Ported; jobs start at bootstrap, stop at shutdown, one DI scope per tick. 23 tests. |
| `queues` | Ported; three existing bugs fixed (threw on import, tokens rejected every definition, default client created twice). 18 tests. |
| `openapi` | One adapter-neutral plugin built on `app.routes()`. 131 tests. `openapi-fastify` and `openapi-bun` are deprecated re-exports. |
| `otel` | One adapter-neutral plugin: an interceptor plus `container.decorate`. 84 tests. `otel-fastify` and `otel-bun` are deprecated re-exports. The SDK is no longer bundled. |
| `adapter-xml` | A response encoder plus the JSX runtime. 157 tests, 23 shared cases on the in-memory, Fastify and Bun adapters. |
| `microservice` | Only made to compile. It was an unimplemented stub in 1.x and still is; its runtime is a separate design. |

**Core changes these ports required**
- `result(kind, body)` and encoders that run inside the pipeline with the request context (adapter-xml).
- `registerController` / `registerModule` and `attributes` in their options (openapi).
- `ctx.onFinish()` and `ctx.responseStatus` (otel).
- `@navios/core/legacy-compat` re-exports the legacy decorator context helpers (schedule).
- A custom result kind with no registered encoder is an error naming the kind.

**Benchmarks after all of the above** (same method as before): GET +0.43 µs, POST +0.06 µs, one guard +0.40 µs, one request value +0.62 µs, one request-scoped service +1.80 µs over raw Fastify; all within budget. DI: ready singleton 0.058 µs, transient 0.133 µs, scoped build 0.39 µs.

**Known gaps left by the ports**
- otel: no span for a request that matches no route, and no per-guard or per-handler spans.
- otel: `sdk-metrics@3` and `sdk-trace-node@2.12` ask for incompatible ranges of `@opentelemetry/api`; yarn warns about it now that the SDK is a real dependency instead of being bundled.
- schedule: `close()` waits for running jobs without a timeout.
- adapter-xml: the whole document is rendered before sending, also for `response: 'stream'`.
- `apps/docs` (the documentation site) and `specs/` still describe 1.x.
