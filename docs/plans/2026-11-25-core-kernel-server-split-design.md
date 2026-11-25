# Navios 2.0: transport-neutral core and `@navios/server`

**Date:** 2026-11-25
**Status:** Design approved 2026-11-25. Phases 1 to 3 are implemented on
`refactor/core-server-split`; phase 4 (commander) is open. Section 16 lists
where the implementation differs from the text below.
**Base branch:** `next`
**Amends:** `2026-11-24-navios-2-0-framework-design.md`. Sections 6.5 (modules),
6.6 (lifecycle) and 6.7 (plugins) of that design are replaced by sections 6 to 9
here. Everything else in it stands and moves, unchanged, to `@navios/server`.
**Affected packages:** `@navios/core` (shrinks to the kernel), new
`@navios/server`; import changes in `@navios/adapter-fastify`,
`@navios/adapter-bun`, `@navios/adapter-xml`, `@navios/openapi*`,
`@navios/otel*`, `@navios/jwt`, `@navios/schedule`, `@navios/microservice`,
`@navios/size-check`. Follow-on work in the separate `commander` repository.

---

## 1. Why this exists

In 1.x, `@navios/core` was a module system with an abstract adapter. An
application could be an HTTP server, a CLI (`@navios/commander`) or a queue
consumer. The 2.0 work turned core into a fast, well-typed HTTP framework, and
in doing so made the module system, the plugin API and the application itself
HTTP-only.

The goal is to get the 1.x flexibility back without giving up anything the
2.0 HTTP design achieved: one process should be able to serve HTTP, consume a
queue, run cron jobs and run CLI commands from one module graph and one
container.

## 2. Evidence

All paths are under `packages/core/src` on `next` unless noted.

1. **Commander cannot run on core 2.0.** `@navios/commander` 1.9 depends on
   `AdapterToken`, `AbstractAdapterInterface`, `getModuleCustomEntry`,
   `ModuleMetadata.customEntries` and
   `NaviosFactory.create({ adapter: defineCliEnvironment() })`. None exist any
   more.
2. **The shared pieces are welded to HTTP in five places.**
   - `modules/module.mts`: `ModuleOptions` carries `prefix`, `controllers`,
     `requestValues`.
   - `plugins/plugin.mts`: `PluginApi` has `adapter: HttpAdapter`, `encoder`,
     `mapError`, and `onBootstrap(routes)`.
   - `guards/guard.mts`, `interceptors/interceptor.mts`: typed against the
     HTTP `RequestContext` and `RouteResult`.
   - `application/navios-application.mts`: hardcodes the error pipeline,
     `assembleRoutes`, `listen`, `inject`.
   - `metadata/member-metadata.mts`: `MethodHandlerMetadata.config` is a
     `RouteEndpointConfig`; `modules/module-graph.mts` imports `joinPaths`.
3. **Two packages already work around the missing kernel.**
   `@navios/microservice` creates its own `Container` and re-declares
   `MessageModule`, `MessageController` and `MessageGuard`.
   `@navios/schedule` is a plugin, so a cron-only worker must create an HTTP
   adapter.
4. **A large part of core is already neutral.** `logger/` (995 lines),
   `config/` (336), `attributes/`, `metadata/class-metadata.mts`,
   `plugins/order-plugins.mts`, `application/lifecycle-hooks.mts`, and the
   module graph apart from prefixes.

## 3. Goals, non-goals, anti-goals

**Goals**

1. `@navios/core` contains no HTTP concept. Its only runtime dependency is
   `@navios/di`; it has no `@navios/builder` peer dependency.
2. An application hosts zero or more transports. All of them share one
   container, one module graph, one plugin set and one lifecycle.
3. One module can declare handlers for several transports (for example
   `controllers` and `commands`), and an application that lacks one of those
   transports still boots.
4. A guard, interceptor or plugin written against the neutral contracts works
   on every transport.
5. The HTTP acceptance numbers and the adapter conformance suite of the 2.0
   framework design hold unchanged.
6. For an HTTP application, migrating from today's `next` is: depend on
   `@navios/server`, and replace the import specifier `@navios/core` with
   `@navios/server`.
7. A cron-only worker runs without an HTTP adapter.

**Non-goals**

- Porting `@navios/commander` (separate repository; contract sketched in
  section 11.1, design of its own later).
- A working Kafka/SQS/RabbitMQ consumer runtime in `@navios/microservice`
  (contract sketched in 11.2).
- WebSocket and gRPC runtimes.
- A generic handler pipeline that every transport must use.

**Anti-goals**

- An HTTP word in the kernel: status, header, cookie, route path, prefix,
  body.
- A call through the kernel on the HTTP request path. The kernel works at
  boot and shutdown; a transport owns everything per request.
- A second module decorator per transport (`@CliModule`, `@MessageModule`).
  One `@Module` serves all of them.

## 4. Approaches

**A. Split, one adapter per application.** `@navios/core` becomes the kernel,
`@navios/server` the HTTP layer, and an application is bound to one adapter as
in 1.x. Least to design. A process that serves HTTP and consumes a queue is
two applications with two containers, and `@navios/schedule` and
`@navios/microservice` each still need their own bootstrap.

**B. Split, application hosts many transports.** Same two packages; the
kernel application takes a list of transports. Adds one contract to design
(section 7). Hybrid processes share a graph and a container, and cron,
commands and consumers are all the same kind of thing.

**C. One package, `@navios/core/http` subpath.** Smallest diff. The boundary
is enforced by lint only, CLI users still install the HTTP code and the
builder peer dependency, and nothing stops the kernel drifting back toward
HTTP.

**Chosen: B**, by the maintainer on 2026-11-25. The `@navios/core` name stays
with the kernel, because commander and the TUI adapters already import
`Injectable`, `Logger` and `Module` from it.

## 5. Package layout

| Today in `core/src` | Goes to |
|---|---|
| `logger/`, `config/`, `attributes/`, `internal/` | core, as is |
| `modules/`, `plugins/`, `application/lifecycle-hooks.mts` | core, generalised (sections 6, 8) |
| `metadata/` | core, minus `config: RouteEndpointConfig` (section 6.3) |
| `guards/`, `interceptors/` | core, generalised (section 9) |
| `context/context-key.mts`, `context/async-context.mts`, `context/context-host.mts` | core, generalised (section 9) |
| new: `application/application.mts`, `transports/` | core (section 7) |
| `adapter/`, `pipeline/`, `routing/`, `errors/`, `responses/`, `sse/`, `controllers/`, `handlers/`, `conformance/`, `testing/` | server, as is |
| `context/request-context.mts`, `request-value.mts`, `request-data.mts`, `reply-controls.mts`, `environment.mts`, `request-context-token.mts` | server |
| `application/navios-application.mts`, `navios-factory.mts`, `assemble-routes.mts` | server, as a facade over the kernel (section 10) |
| `legacy-compat/` | split: `Module`, `AttributeFactory`, `UseGuards`, `UseInterceptors` in `@navios/core/legacy-compat`; `Controller`, `Endpoint` in `@navios/server/legacy-compat`, which re-exports the core ones |

Entry points:

- `@navios/core`, `@navios/core/legacy-compat`, `@navios/core/testing` (a fake
  transport for kernel and plugin tests).
- `@navios/core/transport`: what a transport author needs and application
  code does not. `defineTransport`, the graph types, the function of section
  6.4, `memberMetadata`, `requireMetadata` and the class-metadata helpers,
  `runInContext`, `enableAsyncContext`, and the `Map`-backed context class of
  section 9.1. These are `@internal` today; here they become public API with
  the usual semver promise, because commander consumes them from another
  repository. `adopt` and `isPromise` are not part of it; server keeps its
  own copy.
- `@navios/server`, `@navios/server/testing`, `@navios/server/conformance`,
  `@navios/server/legacy-compat`.

`@navios/server` does `export * from '@navios/core'`, the way core re-exports
`@navios/di` today. An HTTP application imports from one package.

Dependencies: `server → core → di`. The `@navios/builder` peer dependency
moves from core to server. Adapters, `openapi*` and `adapter-xml` depend on
server. `jwt` and `schedule` import nothing HTTP and depend on core only.
`otel` depends on core; its HTTP parts move to a `@navios/otel/http` subpath
that imports server, an optional peer (section 8).

**One copy of core.** Declaration merging into `ModuleOptions`, the single
`AsyncLocalStorage` and `instanceof PlainContextKey` all require that every
package in a process resolves the same `@navios/core`. Therefore:

- `@navios/server` lists core as a regular dependency, so an HTTP application
  installs one package (goal 6).
- Every other package that touches core (adapters, plugins, commander, any
  transport) lists it as a **peer** dependency. An application that combines
  server with such a package may have to list `@navios/core` itself,
  depending on the package manager.
- Core records itself under a `Symbol.for` key on `globalThis` when loaded
  and logs one warning naming both versions if a second copy loads.

Both packages are published as 2.0.0 together.

## 6. Modules

### 6.1 Options are open

The kernel knows five keys:

```ts
// @navios/core
export interface ModuleOptions {
  imports?: ClassType[]
  providers?: Provider[]
  guards?: ClassType[]
  interceptors?: ClassType[]
  attributes?: AttributeValue[]
}
```

A transport package adds its own by declaration merging, the mechanism
`Register` already uses for `ctx.raw`:

```ts
// @navios/server
declare module '@navios/core' {
  interface ModuleOptions {
    prefix?: string
    controllers?: ClassType[]
    requestValues?: RequestValueClass[]
  }
}
```

So this compiles once server and commander are both installed, and
`controllers` is a type error when server is not:

```ts
@Module({
  imports: [DatabaseModule],
  controllers: [UserController],   // @navios/server
  commands: [ImportUsersCommand],  // @navios/commander
})
export class UserModule {}
```

At runtime the kernel stores every key it does not know, unvalidated, in
`ModuleMetadata.entries: Map<string, unknown>`. A transport reads its own
keys from there. A key that no transport of the running application reads is
ignored; that is goal 3. Typos are caught by the type, not at boot.

### 6.2 The graph

`buildModuleGraph(roots)` loses its `globalPrefix` parameter and returns nodes
in dependency order, each with:

- `module`, `providers`, `entries`
- `guards`, `interceptors`: the union over every import path, outermost first
  (unchanged rule)
- `attributes`: nearest module wins (unchanged rule)
- `importers: ModuleNode[]`: the modules that import it

Prefix computation moves to server. It walks `importers` to build each
module's prefix and keeps the existing error for a module with controllers
reached under two prefixes.

### 6.3 Member metadata

`MethodHandlerMetadata` keeps `name`, `guards`, `interceptors`, `attributes`.
The `config` field is replaced by `entries: Map<symbol, unknown>`, in which a
transport stores its own handler declaration under its own symbol. Server
stores the `RouteEndpointConfig` there; `@UseGuards` and attributes keep
working on any transport's handlers because they never touch `entries`.

### 6.4 Which guards and interceptors apply

The kernel exports one function that answers "which guards and interceptors
apply to this handler, in which order", given the module node, the owning
class's metadata and the member metadata. Order is unchanged: application,
module chain, class, member. Server's route assembly uses it. Every other
transport uses it too, so the rule exists once. *Running* the chain is the
transport's business.

## 7. Application and transports

### 7.1 The contract

```ts
// @navios/core
export interface TransportHost {
  readonly container: Container
  readonly logger: LoggerService
  readonly contextHost: ContextHost       // section 9
  readonly asyncContext: boolean
  /** Application-wide interceptors, outermost first. */
  readonly interceptors: readonly ClassType[]
}

export interface Transport {
  /** Reads the graph and compiles handlers. No I/O that accepts work. */
  setup(graph: readonly ModuleNode[]): void | Promise<void>
  /** Starts accepting work: binds, subscribes. Optional. */
  start?(): void | Promise<void>
  /** Stops accepting work and waits for what is in flight. */
  stop(timeoutMs: number): void | Promise<void>
}

export const httpTransport = defineTransport<HttpTransportOptions, HttpTransport>({
  name: 'http',
  create(host, options) { /* ... */ },
})
```

`defineTransport` returns a factory, like `definePlugin`. The factory is also
the lookup key: `app.transport(httpTransport)` returns the `HttpTransport`,
typed. An application may hold two instances of one kind (two brokers); the
second argument of the factory call names an instance, and the lookup takes
the same name.

### 7.2 The application

```ts
import { createApplication } from '@navios/core'

const app = createApplication(AppModule, {
  transports: [httpTransport({ adapter: defineFastifyEnvironment(), listen: { port: 3000 } })],
  plugins: [schedulePlugin({ services: [Reports] })],
})
await app.start()
```

Kernel options: `transports`, `plugins`, `providers`, `container`, `logger`,
`asyncContext`, `requestScopedServices`, `shutdownTimeout`. The HTTP options
(`adapter`, `globalPrefix`, `validateResponses`, `exposeErrorDetails`,
`clientErrorStacks`) become options of `httpTransport`.

`init()` runs once, in this order:

1. Logger.
2. Create every transport, in declared order.
3. Set up plugins, in dependency order.
4. Build the graph, register module providers, instantiate modules, run
   `onModuleInit`.
5. `setup(graph)` on every transport, in declared order.
6. Plugin `onBootstrap` hooks, then `onApplicationBootstrap` on instances.

`start()` runs `init()`, then `start()` on every transport in declared order.

`close(signal?)`:

1. `stop(shutdownTimeout)` on every transport, concurrently. A failure is
   logged and does not prevent the rest.
2. `onApplicationShutdown` on instances, in reverse order.
3. Plugin `onShutdown` hooks, in reverse order.
4. Dispose the container.

`enableShutdownHooks`, `dispose`, `Symbol.asyncDispose`, `get`, `usePlugin`
and `intercept` behave as today. `app.intercept(X)` applies to every
transport.

`start()` is idempotent, per application and per transport: a transport's
`start` runs at most once. A failed `setup` or `start` leaves the application
failed, as a failed `init()` does today; the caller closes it.

An application with no transports is valid. It is how a cron-only worker
runs.

## 8. Plugins

```ts
// @navios/core
export interface PluginApi {
  readonly container: Container
  provide(token, impl): void
  decorate(token, decorator): void
  intercept(interceptor: ClassType): void        // every transport
  addModule(module: ClassType): void
  /** The transport, or undefined when the application has none of this kind. */
  transport<T>(definition: TransportFactory<any, T>, name?: string): T | undefined
  onBootstrap(hook: () => void | Promise<void>): void
  onShutdown(hook: (signal?: string) => void | Promise<void>): void
}
```

Removed from the kernel API and available on the transport instead:
`adapter`, `encoder`, `mapError`, and the `routes` argument of `onBootstrap`.

```ts
// @navios/openapi
setup(api, options) {
  const http = api.transport(httpTransport)
  if (!http) throw new Error('[Navios] @navios/openapi needs the HTTP transport.')
  api.onBootstrap(() => generate(http.routes()))
}
```

In-repo usage today is small: `encoder` twice, `onBootstrap` twice,
`intercept` twice, `adapter` and `mapError` never.

`@navios/otel` splits along the same line. Its main entry depends on core
only: the plugin, the tracer providers, and an interceptor that opens a span
per handler on any transport, using `ctx.handler`, `ctx.find` and
`ctx.onFinish` (section 9.1). `@navios/otel/http` holds
`OtelHttpInterceptor`, which reads the path and headers, and registers it on
the HTTP transport with `http.intercept(...)` (section 10), not with
`api.intercept`, so it never sees another transport's context. The lookup
key stays the transport factory; nothing looks a transport up by name
string.

## 9. Execution context, guards, interceptors

### 9.1 `ExecutionContext`

```ts
// @navios/core
export interface ExecutionContext {
  /** The transport kind: 'http', 'cli', 'message'. */
  readonly kind: string
  readonly id: string
  readonly signal: AbortSignal
  /** The handler being run: module, owning class, name, attribute layers. */
  readonly handler: HandlerInfo
  get<K extends ContextKey>(key: K): ContextValue<K>
  /** Like `get`, but `undefined` instead of throwing when the key is unset. */
  find<K extends ContextKey>(key: K): ContextValue<K> | undefined
  set<T>(key: PlainContextKey<T>, value: T): void
  has(key: ContextKey): boolean
  use<T>(token: ...): T
  resolve<T>(token: ...): Promise<T>
  /** Runs after the handler has finished, whatever the outcome. */
  onFinish(callback: () => void | Promise<void>): void
}
```

This list is complete. Everything else on `RequestContext` is HTTP and stays
out. A kernel `ExecutionContextToken` sits beside server's
`RequestContextToken`, so a request-scoped service can inject the neutral
context.

It is an **interface**. `RequestContext` keeps its implementation and layout
and adds `implements ExecutionContext`, a `kind` of `'http'` and a `handler`
getter returning `route`. `RouteInfo` extends `HandlerInfo`. Nothing is added
between an HTTP request and its handler; that is the anti-goal in section 3.

The kernel also ships a plain class implementing the interface over a
`Map`, for transports that have no reason to write their own.

`createContextKey`, `PlainContextKey`, `ContextHost` and the
`requestScopedServices` policy move to the kernel. `@RequestValue` stays in
server, because its `resolve` takes a `RequestContext`. `AttributeFactory`
reads from a `HandlerInfo`, so `AttributeFactory.get(Roles, ctx.handler)`
works on any transport and `ctx.route` keeps working on HTTP.

### 9.2 Guards and interceptors

```ts
// @navios/core
export interface Guard<Ctx extends ExecutionContext = ExecutionContext> {
  canActivate(ctx: Ctx): boolean | Promise<boolean>
}
export interface Interceptor<Ctx extends ExecutionContext = ExecutionContext, Result = unknown> {
  intercept(ctx: Ctx, next: () => Promise<Result>): Result | Promise<Result>
}
```

`@navios/server` exports its own `Guard` and `Interceptor`, typed as today
(`RequestContext`, `RouteResult`), and they take precedence over the
re-exported kernel ones. HTTP application code does not change.

Server shadows five names in total: `Guard`, `Interceptor`,
`currentContext`, `ContextKey` and `ContextValue`. The last two because the
kernel's `ContextKey` is `PlainContextKey` only, while server's also accepts
a request value class. Passing a request value where the kernel type is
expected is a type error, which is right: neutral code cannot resolve one.
Shadowing needs an explicit named export in server's index for each of the
five; two `export *` of one name is error TS2308.

A guard that should work everywhere imports from `@navios/core` and uses only
the neutral members. One that needs more narrows:

```ts
import { isHttpContext } from '@navios/server'

canActivate(ctx: ExecutionContext) {
  if (isHttpContext(ctx)) return ctx.headers.get('x-api-key') === this.key
  return true
}
```

**The rule to document:** a guard or interceptor attached to a controller or
an HTTP handler only ever sees a `RequestContext`. One attached to a *module*
or to the *application* runs for every transport that has handlers there, so
it must be neutral or narrow by `kind`. Nothing can check this at boot,
because the context type is erased.

### 9.3 Async context

The single `AsyncLocalStorage` moves to the kernel and stores an
`ExecutionContext`. `currentContext()` from `@navios/core` returns
`ExecutionContext | undefined`. `@navios/server` exports its own
`currentContext()` returning `RequestContext | undefined` (undefined when the
current context is not HTTP), so HTTP code and `ConsoleLogger`'s request id
are unaffected. `@navios/otel`'s two uses switch to the kernel one.

## 10. `@navios/server`

Everything HTTP in the 2.0 framework design, plus:

- `httpTransport`: creates the adapter and the error pipeline in `create`;
  in `setup` computes prefixes, checks `requestValues`, assembles and
  registers routes, and calls `adapter.ready()`; `start` listens when
  `listen` options were given; `stop` is `adapter.close`. The instance
  exposes `adapter`, `server`, `routes()`, `listen()`, `inject()`,
  `mapError()`, `encoder()`, and `intercept()` for an interceptor around
  every HTTP route and nothing else.
- `NaviosFactory.create(AppModule, options)` and `NaviosApplication` stay,
  with today's signatures. They build a kernel application whose first
  transport is `httpTransport`, and forward `listen`, `inject`, `routes`,
  `getServer`, `mapError`, `intercept` and `adapter` to it. A new
  `transports` option adds more.
- On the facade, `listen(options)` is the kernel `start()` with HTTP bound to
  `options`: it starts every transport. `init()` and `inject()` start none,
  so a test that injects requests leaves queue consumers unsubscribed.

```ts
// unchanged apart from the import
const app = await NaviosFactory.create(AppModule, { adapter: defineFastifyEnvironment() })
await app.listen({ port: 3000 })

// hybrid
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  transports: [queueTransport({ client })],
})
```

The adapter contract (`HttpAdapter`, `AdapterDefinition`, `CompiledRoute`)
does not change. Adapters change their import specifier only.

## 11. What the other transports look like

These are sketches to test the contract against, not designs.

### 11.1 Commander

- `commanderTransport()`; `ModuleOptions.commands` by declaration merging.
  `@CliModule` becomes a deprecated alias of `@Module`.
- `setup` reads `entries.get('commands')` from every node and fills the
  command registry. Neither `start` nor `stop` does anything; `run(argv)` is a
  method on the transport instance.
- A `CommandContext` implementing `ExecutionContext` (`kind: 'cli'`) replaces
  `CommanderExecutionContext` and the manual `beginRequest` scope.
- `CommanderFactory.create(AppModule)` stays as a facade, like
  `NaviosFactory`.
- The `registry`, `priority` and `overrides` options go away with the DI 2.0
  registry. The TUI's logger override becomes `provide(LoggerOutput, ...)`.

### 11.2 Microservice

- `queueTransport({ client })` on `@navios/queues`;
  `ModuleOptions.messageControllers`.
- `MessageModule`, the metadata copies and `MicroserviceFactory`'s own
  container are deleted. `MessageGuard` becomes `Guard<MessageContext>`.
- `start` subscribes, `stop` unsubscribes and drains.

### 11.3 Schedule

Stays a plugin and depends on core only. Works with zero transports.

## 12. Order of work

Each phase leaves `next` green.

1. **Kernel inside core.** No package moves. Add `Application`,
   `defineTransport`, open module entries, the generalised graph, member
   `entries`, `ExecutionContext`, the neutral plugin API. Rewrite
   `NaviosApplication` as the facade over `httpTransport`. Conformance and
   benchmarks must be unchanged at the end of this phase.
2. **Extract `@navios/server`.** Move the HTTP directories, add the
   re-export, move the builder peer dependency, update every dependent
   package and the docs.
3. **Prove the contract without HTTP.** `@navios/core/testing` fake
   transport; `@navios/schedule` on core only; `@navios/microservice` rebuilt
   on the contract up to `setup` (handler discovery), with `start`/`stop`
   still unimplemented as today.
4. **Commander**, in its repository, as its own design.

## 13. Acceptance

1. `packages/core/package.json` lists `@navios/di` as its only `@navios`
   dependency and has no peer dependencies. No file in `packages/core/src`
   contains an import from `@navios/server` or `@navios/builder`.
2. The benchmark and conformance acceptance of the 2.0 framework design
   (its section 11) pass on both adapters with only import changes.
3. A type test: `controllers` in `@Module` is an error with only core's types
   loaded and accepted with server's.
4. A kernel test with two fake transports: one module with entries for both;
   each transport sees only its own; init, start and close run in the order
   of section 7.2; a failing `stop` does not block the other.
5. A test application with no transports and `schedulePlugin` runs a job and
   shuts down.
6. A test that a module-level guard receives `kind: 'http'` from one
   transport and the fake kind from another.
7. `@navios/size-check` gains an entry for a core-only bundle, and it is
   smaller than the server bundle.
8. For every example and docs snippet that is HTTP-only, the diff is the
   import specifier.

## 14. Left to the builder

- File layout inside both packages.
- The exact generics of `defineTransport` and the lookup signature for named
  instances.
- The `HandlerInfo` field names, as long as `RouteInfo` extends it without
  renaming its existing fields.
- Whether `@navios/core/testing` re-exports `TestContainer`.
- How `httpTransport` shares code with today's `NaviosApplication.initialise`.

## 15. Calls made on your behalf

| # | Call | Alternative |
|---|---|---|
| 1 | Kernel keeps the name `@navios/core`; HTTP becomes `@navios/server` | Keep `@navios/core` as HTTP and name the kernel `@navios/kernel`, which spares HTTP users the import change but breaks commander's imports |
| 2 | `@navios/server` re-exports `@navios/core` | Two imports in every HTTP file |
| 3 | Transports add `@Module` keys by declaration merging; unknown keys are stored and ignored when no transport reads them (6.1) | A decorator per transport; or a boot error for a key nobody reads, which would forbid shared modules |
| 4 | `ExecutionContext` is an interface, and `RequestContext` does not inherit from a kernel class (9.1) | A shared base class, which is less code but puts a kernel class on the HTTP hot path |
| 5 | Module-level and application-level guards and interceptors run on every transport and must narrow by `kind` (9.2) | Guards declare the transports they apply to, checked at boot |
| 6 | Server shadows `Guard`, `Interceptor` and `currentContext` with HTTP-typed versions (9.2, 9.3) | One generic name; HTTP guards write `Guard<RequestContext>` |
| 7 | `mapError`, `encoder`, `adapter` and `routes` leave `PluginApi` for the HTTP transport instance (8) | Keep them in the kernel API as optional members |
| 8 | Each transport owns its error handling; the kernel has no error pipeline | A neutral error-mapping layer in the kernel |
| 9 | The kernel decides which guards and interceptors apply; each transport runs them itself (6.4) | A shared runner in the kernel |
| 10 | Transports stop concurrently with one shared timeout (7.2) | Reverse declared order, one after another |
| 11 | An application with no transports is valid (7.2) | Require at least one |
| 12 | `@navios/schedule` stays a plugin (11.3) | Make it a transport |
| 13 | `NaviosFactory` / `NaviosApplication` stay as the HTTP facade (10) | One `createApplication` for everything |
| 14 | Commander and a working queue consumer are separate designs (3, 12) | One design covering all four packages |
| 15 | `app.listen()` on the HTTP facade starts every transport; `init()` and `inject()` start none (10) | `listen()` starts HTTP only and the other transports need an explicit `app.start()` |
| 16 | Server depends on core; everything else peer-depends on it; a second copy warns at load (5) | Core as a peer of server too, which guarantees one copy but makes every HTTP user install two packages |
| 17 | Transport authors get a public `@navios/core/transport` entry (5) | Export the helpers from the main entry; or keep them internal and copy them per transport |
| 18 | `ExecutionContext` includes `find` and `onFinish`, so tracing works on any transport (9.1) | Keep the interface to keys and services; span handling stays HTTP-only |
| 19 | `@navios/otel` is neutral at its main entry, with HTTP under `@navios/otel/http` (8) | Keep otel depending on server |
| 20 | An HTTP-only interceptor around every route is registered on the HTTP transport; `app.intercept` on the facade means that, and on a kernel application means every transport (10) | One `intercept` everywhere, HTTP ones narrow by `kind` |

## 16. As built

Differences from the sections above, found while implementing.

| Section | As built | Why |
|---|---|---|
| 9.2 | Server shadows three names, not five: `Guard`, `Interceptor`, `currentContext`, plus the `ContextKey` type. `ContextValue` is one structural type in core | Two conditional `ContextValue` types made `RequestContext` unassignable to `ExecutionContext` |
| 7.2 | When `init()` fails, the application stops every transport it created, then rethrows | Otherwise an HTTP adapter and its process-wide settings stay half-open |
| 7.2 | `close()` lets an `init()` or `start()` in flight finish before it stops; a closed application refuses to initialise or start; a transport is stopped once | Found in review: shutdown during boot left transports running |
| 6.3 | Route assembly skips a controller member that only has another transport's entry | One class may hold handlers of two transports |
| 8 | `otelPlugin` loads `@navios/otel/http` with a dynamic import, and adds `autoInstrument.transports` (`'auto'` by default): handler spans for other transports, on by default only where there is no HTTP | The main entry must load without `@navios/server`; an application-wide interceptor would otherwise add a pass-through call to every HTTP request |
| 10 | `httpTransport` options include `errorMappers` and `interceptors`; `app.transport(httpTransport)` is `HttpTransport<any>` | The facade queues `mapError()` / `intercept()` calls made before `init()`; a factory value cannot carry the adapter's environment type |
| 5 | Server also re-exports `buildModuleGraph` and four types from `@navios/core/transport` | They were on the main entry before the split |
| 5 | Packages built on server (adapters, openapi, adapter-xml, otel-fastify, otel-bun) peer-depend on `@navios/core` as well | Without it their bundled declarations inlined a private copy of core's types |
| 11.2, 12 | `@navios/microservice` is a working transport, not only handler discovery: it subscribes through `QueueClient`, validates, runs guards and interceptors, and drains on close. The acknowledgement and retry attributes are still not acted on | `QueueClient` already had `subscribe`, `receive` and `reply`, so stopping at discovery would have left `start()` throwing |
| 12 | `@navios/core/testing` exports `fakeTransport` | As planned for phase 3 |
| 11.3, call 12 | `@navios/schedule` is a transport, `scheduleTransport()`, with `@Module({ jobs })`. `schedulePlugin` is gone | As a plugin it stopped after the hooks of the services its jobs use (a running job lost its database in `close()`), ran jobs before the bootstrap hooks had finished, and kept running them after a failed `start()`. A transport has all three guarantees from the kernel |
| 6.4, call 9 | `handlerChain()` returns the interceptors of the application (`outer`) apart from the attached ones (`inner`). Guards run between the two, on every transport. `runChain` in `@navios/core/transport` runs a chain | With every interceptor outside the guards, a caching interceptor on a handler answered callers the guards would have refused |
