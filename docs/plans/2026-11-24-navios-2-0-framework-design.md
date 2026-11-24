# Navios 2.0: framework design (`di`, `core`, HTTP adapters)

**Date:** 2026-11-24
**Status:** Design approved 2026-11-24 and complete: no open questions remain
(section 13). Implementation plans per phase are not yet written.
**Base branch:** `next`
**Affected packages:** `@navios/di`, `@navios/core`, `@navios/adapter-fastify`,
`@navios/adapter-bun`; follow-on changes in `@navios/builder` (two new
declaration options), `@navios/di-react`, `@navios/otel*`, `@navios/openapi*`,
`@navios/adapter-xml`, `@navios/schedule`, `@navios/microservice`
**Supersedes:** the two unmerged drafts
`2026-11-24-core-correctness-and-weight-design.md` and
`2026-11-24-di-sync-first-resolution-design.md`. Their findings are carried
over (sections 5 and 10); their "do not change what users write" constraint is
dropped.

---

## 1. Why this exists

The authoring surface of Navios is good and worth keeping: endpoints declared
once in `@navios/builder`, and `private readonly x = inject(X)` with full
types. What sits under it has three structural problems that patching will not
remove.

1. **Core does not own the request pipeline.** Guards, request scope, argument
   building, error mapping and response writing are hand-written inside each
   adapter's `controller-adapter.service`. Fastify and Bun each carry a four-
   or five-branch static/dynamic matrix, `otel-bun` carries a third 668-line
   copy, and `microservice` re-declares the metadata again. The copies have
   drifted (section 2.2).
2. **DI resolves everything asynchronously and addresses instances by
   generated strings.** That is the cause of constructors running twice, scope
   being discovered by catching errors, and request scope costing about 14 µs
   per request.
3. **The server throws away what the builder knows.** Status codes, error
   bodies, body kind and response kind are declared in the builder and then
   re-declared (or left unchecked) with `@HttpCode`, `HttpException`,
   `@Multipart` and `@Stream`. Request and reply are `any`.

2.0 is the release where breaking changes are acceptable, so this design
changes the shape rather than the symptoms.

## 2. Evidence

Everything in 2.1 and the items marked *reproduced* in 2.2 were run on `next`
at `875d933` against the built `lib/` output with throwaway probes (not
committed). Items marked *read* are facts about the source (a missing API, a
type, a duplicated export) or Bun-side behaviour that was read and not
executed.

### 2.1 Cost

Node 24.22, `NODE_ENV=production`, `fastify.inject()`, best of five rounds.

| Case | Raw Fastify + zod provider | Navios, static | + static guard | Request-scoped controller |
|---|---|---|---|---|
| `GET /ping`, response schema | 7.6 µs | 10.3 µs | 11.1 µs | 24.4 µs |
| `POST`, query + body + response schema | 22.8 µs | 24.5 µs | 25.4 µs | 36.7 µs |

DI in isolation:

| Case | Time |
|---|---|
| Build `{a, b}` by hand | 0.04 µs |
| `container.get` of a ready singleton | 0.39 µs |
| `beginRequest` + `endRequest`, nothing resolved | 0.32 µs |
| `beginRequest` + two `addInstance` + `endRequest` | 2.3 µs |
| `beginRequest` + `get` request-scoped (2 ready deps) + `endRequest` | 5.6 µs |
| `get` of a singleton through a scoped container | 1.7 µs |
| `get` transient (1 ready dep) | 4.7 µs |

Bootstrap and load:

| Case | Time |
|---|---|
| `app.init()`, 1,000 endpoints / 200 controllers / 400 services | 42 ms |
| Raw Fastify, the same 1,000 routes | 18 ms |
| `import('@navios/core')` (includes builder and zod) | 35 ms |
| `import('@navios/adapter-fastify')` (includes Fastify) | 27 ms |

Reading of these numbers:

- The static path adds 2 to 3 µs. It comes from stacked `async` wrappers and
  awaits, and from `reply.status().headers().send()` in place of a returned
  value.
- Request scope adds about 14 µs and is the only large per-request cost.
- Bootstrap is about 25 µs per endpoint over raw Fastify. Caching boot
  metadata would save almost nothing. Metadata learned at first construction
  pays off in per-request construction instead (section 5.3).
- Cold start is dominated by module load, and core's output is mostly
  duplicated decorator helpers (section 10).

### 2.2 Defects not covered by the earlier drafts

| # | Defect | Status |
|---|---|---|
| 1 | A class token's id is a 32-bit hash of class name plus source text. Two different classes with identical source share one id, and `get(B)` returns A's instance. Affects class factories, mixins, and classes defined inside test blocks. | reproduced |
| 2 | `FactoryInjectionToken` caches its resolved value on the token, so every container in the process shares it. | reproduced |
| 3 | A constructor runs twice when a dependency has an async `onServiceInit`. | reproduced |
| 4 | `NaviosFactory.create({ registry })` fails with "No factory found for LoggerOutput" unless the registry is parented to `globalRegistry`. | reproduced |
| 5 | Fastify runs schema validation before guards (`preHandler`); Bun runs guards first. On Fastify an unauthenticated caller gets body parsing and validation detail before any auth check. Probe: an unauthenticated `POST` with an invalid body returns the 400 validation response and the guard is never called. | reproduced (Fastify) |
| 6 | Response validation is on by default in Fastify and opt-in in Bun. Bun ignores `errorSchema`. A denied guard returns problem+json on Fastify and the text `Forbidden` on Bun. | read |
| 6a | On Fastify the response schema is registered under status 200 only. With `@HttpCode(201)` a body that violates the schema is sent unvalidated (`{"ok":"not-a-boolean"}` with status 201). | reproduced |
| 7 | `app.close()` disposes the adapter and the module loader but never the container, so `onServiceDestroy` does not run. There are no shutdown hooks and no signal handling. | reproduced |
| 8 | `optional()` catches every error, including a throwing constructor, and returns `null`. | reproduced |
| 9 | `HttpException` does not extend `Error` (no stack; `instanceof Error` is `false`) and its body has no link to the endpoint's `errorSchema`, so a handler can break the client's discriminated error union. | read |
| 10 | There is no typed way for a guard to hand data to a handler. `getRequest()` and `getReply()` return `any`; the documented pattern is `request.user = …`. Guards must duck-type headers to work on both adapters. | read |
| 11 | No interceptors, request hooks or error mappers exist in core. `otel` emulates method interception by re-registering services at `priority + 1`; `otel-fastify` uses native Fastify hooks and shares nothing with `otel-bun`. | read |
| 12 | `@navios/builder` and `@navios/core` both export `EndpointParams` and `EndpointResult` with different meanings. | read |
| 13 | `config/types.mts` hard-codes application keys (`'mailer' | 'aws' | 'aiModelsRates' …`); `provideConfig` accepts a schema and never applies it. | read |
| 14 | `setRequestIdEnabled(true)` is a module global and is never reset, so it leaks between applications and tests. | read |

## 3. Goals, non-goals, anti-goals

**Goals**

1. Core compiles one executor per route. An adapter translates a native
   request into that executor's input and writes its result. No adapter
   contains guard, scope or error-mapping logic.
2. A route with no request-scoped dependency costs at most 1 µs over raw
   Fastify. Using a request-scoped service costs at most 2 µs more.
3. A constructor runs once. `inject()` returns the real instance, including
   for transients.
4. Nothing the handler receives or returns is `any`. No `field!: Type`
   anywhere in user code. A handler can be written without repeating a type
   the endpoint already declares.
5. Whatever the builder declares (status codes, error bodies, body kind,
   response kind, headers) is enforced by the server from the declaration
   alone.
6. Fastify and Bun behave identically for guards, validation order, response
   validation and error bodies, proven by one shared conformance suite.
7. Cross-cutting packages (otel, cache, throttle, openapi, health) need no
   access to DI internals and no adapter-specific code for request hooks.
8. Application shutdown is defined: in-flight requests drain, shutdown hooks
   run, the container is disposed.
9. Any Standard Schema library works everywhere a schema is accepted:
   endpoint declarations on the server, DI token args, attributes and config.
   Zod is not a runtime dependency of `di`, `core` or the adapters.
10. Per-request data (session, current user, tenant, transaction) has a
    first-class home that needs no DI scope. Request-scoped services remain
    available but are the last resort, and the framework says so.

**Non-goals**

- A build-time compiler or bundler plugin. Section 5.3 leaves a seam.
- Provider encapsulation per module (Nest-style `providers` / `exports`).
- WebSocket, gRPC and microservice runtimes. The pipeline is shaped so they
  can reuse it; building them is separate work.
- Redesigning `TestContainer` features. They are ported.

**Anti-goals**

- Two ways to declare a dependency that the user must keep in sync.
- Behaviour decided by catching an unrelated error.
- An adapter-specific type in a guard, interceptor or handler signature.
- Keeping an internal accessor alive because a sibling package reaches into
  it. Each such use gets a public API or is removed.

## 4. Approaches

- **A. Patch the current shape.** Fix the defects in place, keep async
  resolution, keep per-adapter pipelines. This is the correctness draft.
  It meets none of goals 1, 2, 4 or 7.
- **B. Sync-first DI with scope derived from the graph, pipeline unchanged.**
  This is the DI draft. Controllers that reach a request-scoped service are
  promoted to request scope automatically. It meets goal 3 and part of goal 2,
  but the static/dynamic handler matrix stays and every promoted controller
  is still built per request.
- **C. Singleton controllers, typed request context, core-owned pipeline
  (picked).** Controllers, guards and interceptors are always singletons.
  Per-request state lives in a typed context passed to the handler. A request
  scope is created only when a handler asks for a request-scoped service.
  Sync-first DI from B is kept underneath.

C is picked because it removes the largest per-request cost for the common
case instead of making it cheaper, deletes the handler matrix outright, and
gives guards and handlers a typed, adapter-neutral request. Its cost is that
`inject(SomeRequestScopedService)` in a controller field becomes a boot error.
Most such services become request values read with `ctx.get(...)` (section
6.1.2); the rest move to `ctx.use(...)` inside the handler.

## 5. `@navios/di`

### 5.1 Identity and storage

- A token is identified by the token object. Stores are `Map<token, Entry>`.
  `name` is for messages only. Hashed ids, `NameResolver`, its LRU cache and
  every name-based lookup are removed.
- Tokens with args keep a second-level `Map<argsKey, Entry>`. `argsKey` is a
  recursive, key-sorted serialisation of the validated args, used in full
  (no hashing).
- A `FactoryInjectionToken`'s resolved value is stored per container.
- An entry holds: status (initialising, ready, failed, destroying), the
  instance or error, the init promise if any, links to the entries it depends
  on and the entries that depend on it, and destroy callbacks. Values are
  never tested for truthiness.

### 5.2 Providers instead of a global registry with priorities

- `@Injectable()` and `@Factory()` attach a provider record to the class's
  own token. A token created with `InjectionToken.create` may be given a
  default provider with `@Injectable({ token })`. A second default for the
  same token from a class with a different name is a `ProviderConflict` error
  at decoration time. A class with the same name replaces the default, so a
  module that is evaluated again (hot reload) keeps working.
- `globalRegistry` and numeric `priority` are removed. Replacement is
  explicit:

  ```ts
  const container = new Container({
    providers: [provide(MailerToken, SmtpMailer), provide(Clock, { value: fakeClock })],
  })
  container.provide(MailerToken, SesMailer) // before first resolution of that token
  ```

  A container looks up its own providers, then its parent's, then the token's
  default. `TestContainer.bind()` is this same mechanism.
- `container.decorate(token, (instance, ctx) => wrapped)` wraps an instance
  after construction and before it is stored. It replaces the
  `priority + 1` re-registration in `@navios/otel` and is what a cache or
  retry package uses.
- Tokens that are only ever supplied per scope are declared as such and need
  no provider:

  ```ts
  export const RequestContextToken = InjectionToken.create<RequestContext>('RequestContext', {
    scope: InjectableScope.Request,
  })
  scope.addInstance(RequestContextToken, ctx) // one Map write, no registry mutation
  ```

  Reaching such a token from the root is a `ScopeMismatchError`, not
  "not found". `StubFactoryClass` is removed.
- `new Container({ strict: true })` ignores the defaults registered on tokens
  and resolves only the providers it was given. `UnitTestContainer` is built
  on it.

### 5.3 Resolution

Sync-first, as in the DI draft:

- A module-level construction stack replaces `injectState`, `wrapSyncInit`
  and the frozen replay. `inject()` builds a missing dependency immediately,
  inside the constructor that asked for it.
- `inject()` of a transient returns a fresh instance. `asyncInject()` remains
  for deliberate cycle-breaking only.
- After construction, `onServiceInit()` returning a non-thenable makes the
  entry ready at once. A thenable makes it pending.
- A class is constructed a second time only when it is being built for the
  first time *and* a dependency has an unfinished async initialiser. Never
  afterwards.
- The ordered list of `(token, args)` a class requested on its first
  successful construction is stored on its provider record as its **plan**.
  Later builds resolve the plan first and then run the constructor once
  against ready dependencies. This is the "metadata collected on first
  successful init", and it is what makes request-scoped and transient builds
  straight-line.
- Conditional `inject()` calls are allowed; an unplanned request extends the
  plan. The "Wrong token order" error is removed.
- Cycles made of `inject()` calls are caught from the stack, in production as
  well. Cross-task cycles are caught by wait edges between entries. No
  `AsyncLocalStorage`, and no separate browser build of the storage shim.
- `optional()` returns `null` only when the token has no provider. Every
  other error propagates.
- `container.getSync(token, args?)` resolves synchronously and throws
  `AsyncInitRequired` when an asynchronous initialiser is involved. It is
  what `ctx.use()` (6.1.3) is built on.
- A transient resolved directly from the root container is not tracked, so
  its `onServiceDestroy` does not run on `dispose()`. A transient injected
  into a service is destroyed with that service, and one resolved directly
  from a scope is destroyed with the scope.
- Internal `[error, value]` tuples become exceptions.

Seam for a later compiler: `@Injectable({ deps: [...] })` supplies the plan
instead of learning it. Nothing in 2.0 uses it.

### 5.4 Scope

- Declared scope only. Automatic promotion is removed, together with
  `ScopeTracker`, `Registry.updateScope` and the holder migration between
  storages.
- A singleton that reaches a request-scoped dependency through `inject()` or
  `optional()` fails with `ScopeMismatchError` naming the full path. In an
  application this surfaces at `init()`.
- A transient takes part in the check: `Singleton → Transient → Request` is
  the same error. (Today the transient "breaks the chain" and the singleton
  silently keeps the first request's instance.)
- `container.createScope()` replaces `beginRequest(requestId)`. A scope has
  no id; nothing is keyed by one. `ScopedContainer` implements
  `Symbol.asyncDispose`:

  ```ts
  await using scope = container.createScope()
  ```

- Disposing a scope whose entries have no destroy callbacks creates no
  promises.

### 5.5 Other changes

- Token args are validated with Standard Schema (section 6.11). The
  dependency on `zod/v4` is removed from `@navios/di`.
- `container.onInvalidate(token, args, listener)` replaces
  `calculateInstanceName` plus `getEventBus()` in `@navios/di-react`.
- Removed from the public surface: `getInstanceResolver`, `getNameResolver`,
  `getScopeTracker`, `getServiceInitializer`, `getTokenResolver`,
  `getStorage`, `getRegistry`, `getEventBus`, `calculateInstanceName`,
  `Injectors.wrapSyncInit`, `Injectors.provideFactoryContext`.

## 6. `@navios/core`

### 6.1 Request context

One object per request, passed to guards and interceptors and as the second
argument to handlers. Everything on it is adapter-neutral except `raw`.

```ts
interface RequestContext<Env extends AdapterEnvironment = RegisteredEnvironment> {
  readonly id: string
  readonly method: HttpMethod
  readonly path: string
  readonly headers: RequestHeaders // get(name), toWebHeaders(); lazy
  readonly cookies: RequestCookies // get(name); lazy
  readonly signal: AbortSignal // aborts when the client disconnects
  readonly route: RouteInfo // module, controller, handler, attributes

  // per-request state, section 6.1.2
  get<K extends ContextKey>(key: K): ContextValue<K>
  find<K extends ContextKey>(key: K): ContextValue<K> | undefined
  set<K extends ContextKey>(key: K, value: Awaited<ContextValue<K>>): void

  readonly reply: {
    header(name: string, value: string): void
    cookie(name: string, value: string, options?: CookieOptions): void
  }

  // request-scoped services, section 6.1.3
  use<T>(token: Injectable<T>): T
  resolve<T>(token: Injectable<T>): Promise<T>

  // native objects, section 6.1.1
  readonly raw: Env['raw']
}
```

`AbstractExecutionContext`, the `Request` / `Reply` / `ExecutionContext`
tokens and the per-adapter request tokens are removed.

`ctx.onFinish(callback)` runs a callback when the response has finished (body
sent, stream ended, or client gone), and `ctx.responseStatus` holds the final
status by then, including one produced by an error mapper. Interceptors use
the pair for spans and metrics. It was added while porting `@navios/otel`,
whose interceptor could otherwise not see a mapped error's status or the end
of a streamed body.

No `AsyncLocalStorage` is involved. An opt-in `asyncContext: true` application
option stores the `RequestContext` in one ALS and enables `currentContext()`
for code that cannot receive it as an argument (logger request ids, otel, a
repository that needs the tenant). It replaces the request-id store and otel's
separate span store.

#### 6.1.1 Native request and reply

`ctx.raw` is the adapter's own objects, typed by the adapter:

| Adapter | `ctx.raw` |
|---|---|
| Fastify | `{ request: FastifyRequest, reply: FastifyReply }` |
| Bun | `{ request: BunRequest, server: Server }` |

The type comes from one declaration in the application, the same pattern
TanStack Router uses:

```ts
declare module '@navios/core' {
  interface Register {
    environment: FastifyEnvironment
  }
}
```

- Without the declaration `ctx.raw` is `unknown`. Nothing is `any`.
- Library code that must work on both adapters narrows explicitly:
  `if (isFastify(ctx)) ctx.raw.reply…`.
- The adapter does not register itself by being imported, because a shared
  package may have both adapters installed.
- Writing the response through the native reply marks it as taken over; core
  then writes nothing and skips response validation for that request.
- `ctx.headers.toWebHeaders()` exists because auth libraries commonly take a
  web `Headers` object; it is built on first call.

#### 6.1.2 Per-request state: context keys and request values

The use cases that push people to request-scoped services are almost all
"a value derived from this request, computed at most once": session, current
user, tenant, locale, a transaction, a data loader. Options considered:

| # | Option | For | Against |
|---|---|---|---|
| a | Mutate the native request (`request.user = …`), today's pattern | Nothing to build | Untyped, adapter-specific |
| b | Typed keys that a guard sets and the handler reads | Typed, free when unused | Eager: the guard must run and must load the value even if the handler ignores it |
| c | Lazy per-request values: a singleton provider with `resolve(ctx)`, memoised in the context | Typed, lazy, no DI scope, can inject singletons, can depend on other values | One new concept |
| d | Declare a route's needs up front (`handler(e, { use: { session } }, …)`) and pass them in | Non-null types without a guard | Second argument shape varies per route; only works in the field form |
| e | Accessors in singletons backed by ALS (`session = requestRef(CurrentSession)`) | Works deep in the call stack | Requires ALS on every request |
| f | Real request-scoped services built by a scoped container | Full `inject()` graph and lifecycle per request | The 14 µs path; needs a scope; cannot be injected into singletons |

**Picked: b and c as one mechanism, f kept as the escape hatch, e available
only with `asyncContext`.** d can be added later on top of c without a design
change.

A `ContextKey` is one slot in the request context. There are two ways to make
one:

```ts
// 1. A plain key. Something sets it; reading it before that throws.
export const CurrentUser = createContextKey<User>('CurrentUser')

// 2. A request value. A singleton that knows how to compute the slot.
@RequestValue()
export class CurrentSession {
  private readonly auth = inject(AuthService)

  resolve(ctx: RequestContext) {
    return this.auth.getSession(ctx.headers.toWebHeaders()) // Promise<Session | null>
  }
}
```

- `ctx.get(CurrentSession)` calls `resolve` the first time and stores what it
  returns; later calls return the stored value. If `resolve` returns a
  promise, the promise is what is stored and returned, so concurrent readers
  share one computation and synchronous providers stay synchronous. The type
  of `ctx.get(K)` is the return type of `resolve`.
- `ctx.set(key, value)` fills a slot directly. It works for both kinds, so a
  guard that already has the session can pre-fill `CurrentSession`.
- A provider may read other slots with `ctx.get(...)`. A cycle is detected
  per request and reported with the path when the providers read each other
  synchronously. Two asynchronous providers that each `await` the other
  before returning are not detected and would wait forever; that is a known
  limit of the implementation.
- A provider may implement `dispose(value, ctx)`, called when the response
  finishes, in reverse resolution order. That covers a transaction or a unit
  of work.
- Providers are ordinary singletons: constructed once at boot, free to
  `inject()` other singletons. No scope, no plan, no per-request
  construction. The per-request cost is one `Map` entry per slot actually
  read.

The auth case end to end:

```ts
@Injectable()
export class AuthGuard implements Guard {
  async canActivate(ctx: RequestContext) {
    const session = await ctx.get(CurrentSession)
    if (!session) throw new UnauthorizedException()
    ctx.set(CurrentUser, session.user)
    return true
  }
}

// handler, behind the guard
const user = ctx.get(CurrentUser) // User, synchronous, never null

// public handler that wants the session if there is one
const session = await ctx.get(CurrentSession) // Session | null, loaded on demand
```

A public endpoint that never asks for the session never loads it.

#### 6.1.3 Request-scoped services

They stay, for the cases request values do not fit: a third-party class that
has to be constructed per request, or a set of per-request classes that want
`inject()` between themselves and `onServiceInit` / `onServiceDestroy`.

- Reached only through `ctx.use(Token)` (synchronous) or `ctx.resolve(Token)`
  (when an async initialiser is involved). `ctx.use()` throws a clear error
  pointing to `ctx.resolve()` if the service or a dependency has an
  unfinished async initialiser.
- The first call creates the request scope and registers it for disposal
  when the response finishes. A request that never calls them has no scope.
- Inside one, `inject(RequestContextToken)` gives the context, so it can read
  slots.
- Internally the scope's store is the same per-request map that holds the
  slots, so there is one per-request structure, not two.

How the framework discourages them:

1. They cannot be injected into a controller, guard, interceptor or any
   other singleton. The boot error names the path and suggests a request
   value.
2. Reaching one takes an explicit call in the handler; a request value is
   shorter to write and to read.
3. `requestScopedServices: 'allow' | 'warn' | 'forbid'` application option,
   default `'warn'` outside production and `'allow'` in production. The
   check happens the first time a token is requested with `ctx.use()` or
   `ctx.resolve()`, because there is no registry to enumerate at `init()`:
   `'warn'` logs once per token with a one-line pointer to request values,
   and `'forbid'` makes that call throw.
4. Documentation presents request values first and request-scoped services
   under "advanced".

### 6.2 Compiled route pipeline

At `init()`, core builds one executor per route:

```ts
type RouteExecutor = (input: RouteInput) => RouteResult | Promise<RouteResult>

interface RouteInput {
  method: string
  path: string
  id?: string
  header(name: string): string | undefined
  headers(): Headers
  urlParams: Record<string, string>
  query(): unknown
  body(): unknown | Promise<unknown> // not called until guards have passed
  signal(): AbortSignal
  raw: unknown
}

interface RouteResult {
  status: number
  headers?: Record<string, string>
  cookies?: SetCookie[]
  body: unknown
  kind: 'json' | 'text' | 'blob' | 'stream' | 'sse' | 'empty' | string
  release?: () => void | Promise<void> // called by the adapter when the response is done
}
```

Stage order, identical on every adapter:

1. Build `RequestContext`.
2. Interceptors enter, outermost first.
3. Guards, in order module → controller → endpoint.
4. Validate URL params, query and headers; then read and validate the body.
5. Handler.
6. Validate the reply against the declared schema for its status.
7. Interceptors exit.
8. Any thrown error goes through error mappers and becomes a `RouteResult`.

Guards run before the body is read. That fixes defect 5 and means an
unauthenticated request never pays for body parsing.

Compilation rules:

- Stages a route does not use are not in its executor. A route with no
  guards, no interceptors and no request schemas is a call to the handler
  plus response handling.
- Guards and interceptors are resolved once at boot. They are singletons, so
  there is one code path, not a static/dynamic matrix.
- The executor adds at most one promise layer over the handler's own.
- Validation uses Standard Schema directly. `fastify-type-provider-zod` and
  the Fastify validator and serializer compilers are no longer used; both
  adapters go through the same code.
- Response validation has one default for both adapters:
  `validateResponses: 'always' | 'development' | 'never'`, default `'always'`
  (it strips undeclared fields, which is a safety property).

`AbstractHandlerAdapterService`, `InstanceResolverService`,
`GuardRunnerService.runGuards` / `runGuardsStatic`, and the endpoint,
multipart and stream adapter tokens and factories are removed.

### 6.3 Guards, interceptors, error mappers

```ts
interface Guard {
  canActivate(ctx: RequestContext): boolean | Promise<boolean>
}

interface Interceptor {
  intercept(ctx: RequestContext, next: () => Promise<RouteResult>): Promise<RouteResult>
}

app.mapError(UserNotFound, (error, ctx) => reply(404, { message: error.message }))
```

- Interceptors attach at application, module, controller or endpoint level,
  the same four levels as guards.
- A guard that returns `false` produces the Forbidden responder's result. A
  guard may set response headers through `ctx.reply` (needed by throttling).
- Error mapping order: mappers registered with `app.mapError` (most specific
  class first), then `HttpException`, then validation errors, then the
  internal-error responder.
- `HttpException` extends `Error`. Every error response is
  `application/problem+json` unless the endpoint declares an `errorSchema`
  for that status, in which case the declared body is sent.
- Internal error text is not sent to clients unless
  `exposeErrorDetails: true`. The error is always logged in full.
- `TooManyRequestsException` (429) and `UnprocessableEntityException` (422)
  are added.

### 6.4 Handlers

One decorator. The body kind and response kind come from the declaration, so
`@Multipart`, `@Stream` and `@HttpCode` are removed.

Two forms are supported and produce the same route metadata.

**Method form.** Types are checked by the decorator; the parameter type has
to be written because TypeScript does not infer method parameters from a
decorator.

```ts
@Controller()
export class UsersController {
  private readonly users = inject(UsersService)

  @Endpoint(getUser)
  async getUser({ urlParams }: HandlerParams<typeof getUser>, ctx: RequestContext) {
    const user = await this.users.findById(urlParams.id)
    return user ?? reply(404, { message: 'User not found' })
  }
}
```

**Field form.** Everything is inferred from the endpoint; nothing is
annotated.

```ts
@Controller()
export class UsersController {
  private readonly users = inject(UsersService)

  getUser = handler(getUser, async ({ urlParams }, ctx) => {
    const user = await this.users.findById(urlParams.id)
    return user ?? reply(404, { message: 'User not found' })
  })

  createUser = handler(createUser, { guards: [AdminGuard] }, async ({ data }) =>
    reply(201, await this.users.create(data)),
  )
}
```

Field handlers are discovered from the controller instance at boot. That is
possible because controllers are always singletons.

- The route name is the property name. `this` inside the arrow function is
  the controller, so `inject()` fields work as in the method form.
- Guards, interceptors and attributes go in the options object
  (`{ guards, interceptors, attributes: [Public()] }`). Attribute decorators
  also work on the field (`@Public() getUser = handler(…)`).
- A handler field on a base class is inherited by subclasses like any other
  field.
- Declaring the same endpoint twice in one application is a boot error that
  names both handlers, in either form.

#### 6.4.1 Route introspection

Because field handlers exist only on the instance, class-level metadata is no
longer the source of truth for routes. Core exposes the compiled list:

```ts
app.routes(): readonly RouteInfo[]
// { method, path, endpoint (the builder declaration), module, controller,
//   handlerName, guards, interceptors, attributes }
```

- `ctx.route` is the same `RouteInfo` object.
- `AttributeFactory.get(Public, ctx.route)` reads an attribute, resolving
  endpoint, then controller, then module.
- `@navios/openapi` reads `app.routes()` instead of
  `extractControllerMetadata` and direct `customAttributes` access.
- Plugins see routes contributed by other plugins, because the list is built
  after every `api.addModule` call has been applied.

Return values:

- With `responseSchema`: return the body; status is 200.
- With `responses`: return `reply(status, body)`, typed per status.
- With `errorSchema`: `reply(status, body)` is also accepted for the declared
  error statuses and is typed the same way. This is the type-safe way to send
  a declared error.
- A thrown `HttpException` whose status has an `errorSchema` entry is
  validated against it outside production; a mismatch is logged as an error.
- `response: 'stream'`: return a `ReadableStream` or an `AsyncIterable`. The
  return type is checked. Core does not hand the native reply to the handler.
- `response: 'void'`: return nothing; status is 204.

Type helpers are renamed `HandlerParams<E>` and `HandlerResult<E>` so they no
longer collide with the builder's client-side `EndpointParams` and
`EndpointResult`.

Schemas are accepted as Standard Schema (section 6.11). The Zod-only
narrowing in `zod-endpoint-options.mts` is removed.

### 6.5 Modules

A module is a route group. That is what it is today; 2.0 says so and makes it
useful:

```ts
@Module({
  prefix: '/users',
  imports: [AuditModule],
  controllers: [UsersController],
  guards: [AuthGuard],
  interceptors: [TimingInterceptor],
  providers: [provide(UserStore, PgUserStore)],
})
export class UsersModule {}
```

- Effective guards and interceptors are computed per application as a
  transitive union over the import graph, into a per-application copy.
  Class-level metadata is never mutated, so two applications in one process
  do not affect each other and the result does not depend on import order.
- `providers` are application-wide (no encapsulation). `overrides` and its
  priority validation are removed.
- Modules are keyed by their class, not by a token id string.
- `prefix` composes through imports: a module imported by a module with a
  prefix gets both, outermost first, after the application's global prefix.
- `onModuleInit` stays and runs after the module's imports have finished
  initialising, in sequence.

### 6.6 Lifecycle and shutdown

- Services: `onServiceInit`, `onServiceDestroy` (unchanged).
- Any singleton may implement `onApplicationBootstrap()` (routes compiled,
  before listening) and `onApplicationShutdown(signal?)`.
- `app.close()`:
  1. stop accepting connections;
  2. wait for in-flight requests, up to `shutdownTimeout` (default 10 s),
     then abort their `ctx.signal`;
  3. run `onApplicationShutdown` hooks in reverse bootstrap order;
  4. dispose the adapter;
  5. dispose the container, which runs `onServiceDestroy` in reverse creation
     order.
- `app.enableShutdownHooks(['SIGTERM', 'SIGINT'])` is opt-in.

### 6.7 Plugins

One shape. The ten staged interfaces, their ten `define…Plugin` helpers and
the legacy `NaviosPlugin` are removed.

```ts
export const otelPlugin = definePlugin({
  name: 'otel',
  dependsOn: [],
  setup(api, options: OtelOptions) {
    api.provide(TracerToken, { value: createTracer(options) })
    api.decorate(TracedToken, wrapWithSpans)
    api.intercept(TracingInterceptor)
    api.mapError(SomeError, handler)
    api.addModule(DocsModule) // contributes routes before compilation
    api.onShutdown(() => flush())
    api.adapter(FastifyAdapter)?.server.addHook(...) // typed, optional
  },
})
```

Each call is declarative; core applies it at the right point of `init()`, so
plugins do not choose stages. Plugins are deduplicated by name and ordered by
`dependsOn`. `usePlugin` after `init()` throws.

### 6.8 Response encoders

A response `kind` maps to something an adapter writes. Core and the adapters
handle `json`, `text`, `blob`, `stream`, `sse` and `empty`. A package adds
another kind in two parts:

- a helper built on `result(kind, body)`, which a handler of a
  `response: 'text' | 'stream' | 'blob'` endpoint returns, for example
  `xml(<Feed />)`;
- an encoder registered with `api.encoder(kind, (result, ctx) => …)` that
  turns that result into one of the kinds above.

Encoders run inside the pipeline, after the handler's value has become a
result and before interceptors exit. They receive the request context, and an
error they throw is mapped like any other. (An earlier draft applied encoders
after error mapping, outside the pipeline; porting `@navios/adapter-xml`
showed that such an encoder has no access to the request and that its errors
were adapter-dependent.)

`@navios/adapter-xml` is an encoder plus its JSX runtime; core's
`XmlStreamAdapterToken` and factory are removed, and third parties can add a
response kind without touching core.

### 6.9 Testing

- `createTestClient(app)` returns a builder client bound to the application
  in process: `await client(getUser, { urlParams: { id: '1' } })` returns the
  builder's typed result, and `.safe()` returns the typed error union. It
  works on both adapters.
- `TestingModule` and `UnitTestingModule` keep their methods; overrides use
  `provide()`.

### 6.10 Smaller breaking cleanups

- `logger: false` binds a no-op logger. A custom logger is honoured together
  with request ids. The console logger moves behind a subpath export so
  applications with their own logger do not load it.
- Request-id enablement is per application, read from `RequestContext`.
- `ConfigService`: the application-specific `ExcludedParts` is removed;
  `provideConfig({ schema, load })` validates the loaded value and types the
  service from the schema.
- `AttributeFactory`: `getAll` returns every value, `getLast` no longer skips
  falsy values, the duplicated legacy copy is removed.
- `@Header` is removed in favour of `ctx.reply.header()`.
- `wrapWithErrorHandling`, `pendingAdapterCalls` string dispatch and the
  `Call setAppModule() first` message are removed.

### 6.11 Standard Schema

`@navios/builder` already accepts any Standard Schema (`types/schema.mts`,
`request/validate.mts`). The server narrows every slot back to Zod and reads
Zod internals. 2.0 removes that narrowing everywhere.

- **Types.** `di` inlines the `StandardSchemaV1` interface (the specification
  is designed to be copied) and exports it with `InferInput` and
  `InferOutput`; `core` uses those. No package is added. The builder's
  `Schema` type is structurally the same, so a declaration flows through
  unchanged.
  Input and output types come from `~standard.types`.
- **Validation.** One helper in core calls `schema['~standard'].validate`.
  A synchronous result is handled synchronously; only a returned promise is
  awaited, so synchronous libraries keep the executor's fast path.
- **Errors.** Core defines `ValidationError` carrying Standard Schema issues
  (`message`, `path`). The validation responder formats those. The
  `instanceof ZodError` checks in both adapters and in the Fastify error
  handler are removed.
- **Where schemas are accepted:** endpoint `querySchema`, `requestSchema`,
  `urlParamsSchema`, `headersSchema`, `cookiesSchema`, `responseSchema`,
  `responses`, `errorSchema`; DI token args (`InjectionToken.create(name,
  schema)`, `@Injectable({ schema })`); `AttributeFactory.createAttribute`;
  `provideConfig({ schema })`.
- **DI token args must validate synchronously,** because `inject()` is
  synchronous. A schema whose `validate` returns a promise for token args is
  an error naming the token.
- **Required versus optional args.** Today the type of `inject(token)` checks
  `ZodOptional`. It becomes `undefined extends InferInput<S>`, which works
  for any vendor.
- **Multipart.** The Fastify multipart adapter casts `requestSchema` to
  `ZodObject` to inspect its shape. Core instead collects fields and files
  into a plain object and validates the whole object.
- **Framework-internal schemas** (logger options, plugin options) are
  hand-validated, so `zod` is not a runtime dependency of `di`, `core` or the
  adapters. It stays a dev dependency for tests and examples.
- **OpenAPI** is the one consumer that needs more than validation. It gets
  JSON Schema through `~standard.jsonSchema` or a converter option; see
  section 13, item 2.

### 6.12 Server-sent events and sockets

`@navios/builder` declares typed event sources (`defineEvent({ eventName,
payloadSchema })`) and sockets. The server has no counterpart today.

- **SSE is in 2.0**, as a response encoder. An endpoint declared with
  `response: 'stream'` may return an `AsyncIterable` of
  `sse(eventDeclaration, payload)` values. The payload is typed and validated
  from the event's `payloadSchema`, the encoder writes the event-stream
  framing, and `ctx.signal` ends the iteration when the client disconnects.
- **Sockets are not in 2.0.** The parts they need are adapter-neutral by
  design so that the socket runtime does not grow a parallel guard system
  (the `WsGuard` / `WsExecutionContext` in the draft spec): `Guard`, context
  keys, request values and error mappers take a context, not an HTTP request.
  The socket work defines its own context type that shares the slot API.

### 6.13 Legacy decorators

Applications that compile with `experimentalDecorators` use
`@navios/core/legacy-compat` today (both `e2e-*-legacy` examples do). It
duplicates each decorator and the whole attribute factory.

- Every legacy decorator is a thin signature adapter that builds a decorator
  context and calls the standard decorator of the same name, so there is one
  implementation.
- `registerController(cls, options)` and `registerModule(cls, options)`
  define controllers and modules with no decorator syntax at all. Library
  packages that are built without a decorator transform use them
  (`@navios/openapi` serves its routes this way).
- The field form needs no method decorator at all, so a legacy-decorator
  application that uses it depends only on the class decorators.
- `legacy-compat` keeps its subpath. Its surface shrinks to `Injectable`,
  `Factory`, `Controller`, `Module`, `Endpoint`, `UseGuards`,
  `UseInterceptors` and attribute creation.

## 7. HTTP adapters

An adapter implements:

```ts
interface HttpAdapter<Env> {
  readonly server: Env['server']
  register(route: CompiledRoute): void // route info plus executor
  setNotFound(execute: RouteExecutor): void
  ready(): Promise<void>
  listen(options: Env['listenOptions']): Promise<string>
  inject(request: TestRequest): Promise<TestResponse> // for tests
  close(timeoutMs: number): Promise<void>
}
```

An adapter package exports an `AdapterDefinition` factory
(`defineFastifyEnvironment(options)`, `defineBunEnvironment(options)`) whose
`create(context)` returns the adapter.

Per request it builds a `RouteInput`, calls the executor and writes the
`RouteResult`. Expected size is a few hundred lines each.

- **Fastify:** routes are registered without schemas. Guards run inside the
  executor, before the body is validated. The `onResponse` hook disposes a
  request scope only if one was created.
- **Bun:** CORS is applied once per response in the adapter, not in each
  handler branch. `BunFakeReply` is removed.
- CORS and multipart options are passed to the adapter factory
  (`defineFastifyEnvironment({ cors, multipart })`) instead of being queued
  through `app.enableCors()` before the adapter exists.
- A conformance suite, `runAdapterConformance` from
  `@navios/core/conformance`, runs against both adapters over real HTTP and
  covers guard order, validation order, response validation, error bodies,
  headers and cookies, streams, multipart, request scope release, client
  disconnect and shutdown. It takes the test runner's functions as an
  argument (Vitest for Fastify, `bun:test` for Bun) and uses a hand-written
  Standard Schema, so it depends on no schema vendor.
- A malformed request body is reported by the adapter as a
  `ValidationError` with source `body`, so it becomes a 400 like any other
  validation failure.
- For multipart bodies core provides `createMultipartCollector(schema)`.
  It asks the schema for JSON Schema (`~standard.jsonSchema`) to learn which
  fields are arrays or objects, and falls back to the shape of the parts.

## 8. `@navios/builder` additions

- `headersSchema` and `cookiesSchema` on a declaration. The client requires
  the declared headers in its arguments; the server validates them and
  exposes them as `params.headers` and `params.cookies`.
- An in-process transport hook so `createTestClient` can reuse the real
  client code path.

## 9. Migration for application code

| 1.x | 2.0 |
|---|---|
| `@HttpCode(201)` | `responses: { 201: schema }` in the declaration, `return reply(201, body)` |
| `@Multipart(e)`, `@Stream(e)` | `@Endpoint(e)` or `handler(e, …)` |
| `@Header(name, value)` | `ctx.reply.header(name, value)` |
| `EndpointParams<typeof e>` from core | `HandlerParams<typeof e>`, or the field form |
| `context.getRequest().headers…` in a guard | `ctx.headers.get(name)` |
| `request.user = user`, `inject(Request).user` | `ctx.set(CurrentUser, user)`, `ctx.get(CurrentUser)` |
| `inject(Request)` / `inject(FastifyRequestToken)` | `ctx.raw.request` |
| Request-scoped `SessionService` / `CurrentUserService` | `@RequestValue()` class, read with `ctx.get(...)` |
| `inject(RequestScopedService)` in a controller | `ctx.use(RequestScopedService)` in the handler |
| Zod-only server schemas | any Standard Schema; Zod keeps working unchanged |
| `@Injectable({ priority: 10 })` to replace a service | `provide(Token, Impl)` |
| `@Module({ overrides })` | `@Module({ providers: [provide(…)] })` |
| `container.beginRequest(id)` | `container.createScope()` |
| `asyncInject(Transient)` | `inject(Transient)` |
| `app.enableCors(o)` | `defineFastifyEnvironment({ cors: o })` |
| `defineXxxPlugin` / legacy plugin | `definePlugin({ name, setup })` |

## 10. Carried over from the earlier drafts

These stand as written there and are part of this design:

- Falsy injected values (`0`, `''`, `false`, `null`) inject as themselves.
  Reproduced: a token bound to `false` injects the throwing placeholder.
- Controller and guard construction errors fail `init()` with the original
  error. (Now a direct consequence of 5.4 and 6.2.)
- Internal error text is not sent in 500 responses (6.3). Reproduced: a
  handler throwing `new Error('db password is hunter2')` returns that text in
  `detail`.
- Framework packages register their own classes with
  `registerInjectable(...)` instead of decorators, so `di`, `core` and both
  adapters ship no inlined decorator helper and do not need the SWC plugin to
  build. Other packages use `externalHelpers`.
- `@navios/adapter-fastify`: drop `@fastify/swagger` and `openapi-types`.
  `zod` is no longer a dependency of either adapter after 6.2.
- A size check in CI: no `_apply_decs` in the four packages' output, and a
  per-package ESM size budget.

## 11. Acceptance

Behaviour, as tests:

1. Two classes with identical source resolve to distinct instances.
2. A class with no async-initialised dependency is constructed once, cold; a
   class with one is constructed twice cold and once afterwards.
3. `inject()` of a transient returns a distinct instance per call.
4. A singleton reaching a request-scoped service, directly or through a
   transient, fails with `ScopeMismatchError` listing the path.
5. `optional()` rethrows a constructor error and returns `null` for a token
   with no provider.
6. A `FactoryInjectionToken` is resolved once per container.
7. An unauthenticated request with an invalid body gets the guard's response
   on both adapters, and the body is not read.
8. A request that never calls `ctx.use` / `ctx.resolve` creates no scope.
9. A value set by a guard with a context key is read with its type in the
   handler; reading an unset key throws.
10. `reply()` with an undeclared status is a compile error and, if forced, a
    500 at runtime.
11. A thrown error with a registered mapper produces the mapper's result on
    both adapters.
12. `app.close()` waits for an in-flight request, runs shutdown hooks, and
    runs `onServiceDestroy`.
13. Two applications in one process importing the same module under
    different parents do not share guards.
14. The conformance suite passes on Fastify and Bun.
15. A type test: the field form compiles with no annotations and rejects a
    wrong return type; no `any` in `RequestContext`, guard, interceptor or
    handler signatures.
16. A request value's `resolve` runs once per request under concurrent
    `ctx.get` calls, not at all when unread, and its `dispose` runs when the
    response finishes. A cycle between request values fails with the path.
17. `ctx.set` on a request value's key makes `ctx.get` return that value
    without calling `resolve`.
18. A type test: with `Register` declared, `ctx.raw.request` is the adapter's
    request type; without it, `ctx.raw` is `unknown`.
19. `requestScopedServices: 'forbid'` makes `ctx.use()` throw; `'warn'` logs
    once per token.
20. The conformance suite runs its endpoint cases three times, with Zod,
    Valibot and ArkType schemas, on both adapters. A DI token with a
    non-Zod args schema validates and types its args.
21. An SSE endpoint emits typed events, rejects a payload that violates the
    event's schema, and stops iterating when the client disconnects.
22. `app.routes()` lists method-form and field-form handlers identically,
    including routes added by a plugin; a duplicate endpoint fails `init()`.
23. The legacy-decorator examples pass the conformance suite.
24. `di`, `core` and both adapters build and pass their runtime tests with
    `zod` absent from `node_modules` of a consuming application.

Performance, as a committed benchmark comparing against raw Fastify in the
same run:

| Case | `next` today | Required |
|---|---|---|
| `GET`, no guards, response schema | +2.7 µs over raw | at most +1 µs |
| `POST`, query + body + response schema | +1.7 µs over raw | at most +1 µs |
| Same `GET`, one guard | +3.5 µs | at most +1.5 µs |
| Same `GET`, handler reads one request value (synchronous `resolve`) | no equivalent | at most +1.3 µs |
| Same `GET`, handler uses one request-scoped service (2 ready deps) | +16.8 µs | at most +3 µs |
| `get` of a ready singleton | 0.39 µs | not slower |
| `get` transient (1 ready dep) | 4.7 µs | at most 1.2 µs |
| `import('@navios/core')` | 35 ms | at most 20 ms |

## 12. Order of work

Each phase gets its own implementation plan. The packages do not need to stay
releasable between phases; this lands as one major version.

1. **DI.** Token identity and stores, providers and `provide` / `decorate`,
   sync-first resolution and plans, declared scope, `createScope`,
   destruction and `onInvalidate`. Port testing containers and
   `@navios/di-react`.
2. **Core pipeline.** `RequestContext`, context keys and request values,
   the Standard Schema validation helper and `ValidationError`, route
   compilation, guards, interceptors, error mappers, response validation,
   encoders.
3. **Adapters.** Rewrite Fastify and Bun against `HttpAdapter`; conformance
   suite.
4. **Handlers and builder parity.** Single `@Endpoint`, `handler()` field
   form, typed error replies, `headersSchema` / `cookiesSchema`, Standard
   Schema on the server, `createTestClient`.
5. **Lifecycle and plugins.** Bootstrap and shutdown hooks, `definePlugin`,
   module `prefix` / `interceptors` / `providers`.
6. **Downstream.** otel (one adapter-neutral interceptor plus `decorate`),
   openapi, adapter-xml as an encoder, schedule on the shared lifecycle.
7. **Weight and cleanups.** Decorator-free internals, size check, section
   6.10, benchmarks and the acceptance table.

## 13. Resolved and deferred questions

Nothing here blocks implementation.

**Resolved**

1. *Does `@navios/di-react` need token ids that are stable across reloads or
   between server and client?* No. Its only use of `token.id` is a cache key
   for suspense resources inside one process
   (`hooks/use-suspense-service.mts:35`); nothing is serialised or hydrated.
   That cache becomes a `WeakMap` keyed by the token. The other two users of
   ids go away as well: the module loader keys modules by class (6.5), and
   `@navios/otel` no longer derives `${id}:original` tokens because it uses
   `decorate` (5.2). Tokens therefore need no explicit `id`.
2. *How does `@navios/openapi` get JSON Schema from a Standard Schema?*
   Through the Standard JSON Schema extension, `~standard.jsonSchema`.
   Checked against the versions installed in this repository: zod 4.6.7 and
   arktype 2.2.10 implement it; valibot 1.5.0 does not. So:
   - when `~standard.jsonSchema` is present, openapi calls
     `jsonSchema.input(...)` for request slots and `jsonSchema.output(...)`
     for responses;
   - otherwise it uses the `toJsonSchema` option of the openapi plugin, a
     function from schema to JSON Schema (for valibot, its own converter
     package);
   - with neither, that slot is documented as an unconstrained schema and a
     warning naming the endpoint is logged once at `init()`.

**Deferred, with the decision recorded**

3. *A precompiled JSON serialiser per response schema.* Not in 2.0.
   Validation already walks the value once; whether a second, faster
   serialisation step pays for itself is measured after phase 3 with the
   committed benchmark, and added behind `validateResponses` if it does. No
   public API depends on the answer.
4. *Declaring a route's request values up front so they arrive non-null*
   (option d in 6.1.2). Not in 2.0. It is additive on top of request values
   and only affects the field form's options object.
5. *Socket runtime* (6.12) and *provider encapsulation per module* (section
   3, non-goals) are separate designs.

## 14. Left to the builder

- Internal file layout and names in every package.
- The entry and plan data structures, given the fields in 5.1 and 5.3.
- How lazy headers and cookies are implemented per adapter.
- The exact `TestRequest` / `TestResponse` shapes.
- Whether the executor is assembled from closures or generated code, as long
  as the acceptance numbers hold.

## 15. Calls made on your behalf

| # | Call | Alternative |
|---|---|---|
| 1 | Controllers, guards and interceptors are always singletons; request-scoped services are kept but reached only with `ctx.use()` (4 C, 6.1.3) | Keep `inject()` of request-scoped services in controllers with graph-derived promotion (4 B) |
| 2 | Automatic scope promotion is removed; a scope mismatch is a boot error (5.4) | Derive scope from the graph |
| 3 | `globalRegistry` and priorities are replaced by default providers plus explicit `provide()` (5.2) | Keep priorities, fix only the id collision |
| 4 | Both handler forms ship; documentation leads with the field form (6.4) | Method form only, and accept the repeated parameter type |
| 5 | Core validates with Standard Schema; Fastify's schema compilers are not used (6.2) | Keep Fastify-native validation and accept adapter differences |
| 6 | Response validation defaults to `'always'` on both adapters (6.2) | `'development'` by default, for throughput |
| 7 | `@HttpCode`, `@Header`, `@Multipart`, `@Stream` are removed (6.4, 6.10) | Keep them as thin aliases for one major |
| 8 | Every non-declared error body is problem+json, including `HttpException` (6.3) | Keep sending `HttpException.response` verbatim |
| 9 | Modules stay route groups with application-wide providers (6.5) | Add provider encapsulation |
| 10 | No `AsyncLocalStorage` by default; one opt-in store for the whole context (6.1) | Always on, so `currentContext()` works everywhere |
| 11 | Plugins lose stages in favour of declarative calls (6.7) | Keep stages, reduce them to three |
| 12 | Guards run before the body is read (6.2) | Allow a guard to opt in to the validated body |
| 13 | `container.createScope()` with no request id (5.4) | Keep `beginRequest(id)` and the uniqueness check |
| 14 | Guard union across shared modules is transitive (6.5) | Guards apply to a module's own controllers only |
| 15 | Context keys and lazy request values are one mechanism and the primary home for per-request data (6.1.2) | Keys set by guards only; anything lazy is a request-scoped service |
| 16 | `requestScopedServices` defaults to `'warn'` in development (6.1.3) | `'allow'`, discourage through documentation only |
| 17 | `ctx.raw` is typed through a `Register` declaration in the application (6.1.1) | A generic parameter on every guard and handler signature, or `ctx.raw(FastifyRaw)` with a token |
| 18 | The native reply is reachable through `ctx.raw`, and using it takes the response over (6.1.1) | Expose the native request only |
| 19 | DI token arg schemas must validate synchronously (6.11) | Allow async validation and make such tokens pending on first use |
| 20 | `zod` leaves the runtime dependencies of `di`, `core` and the adapters (6.11) | Keep Zod for framework-internal schemas |
