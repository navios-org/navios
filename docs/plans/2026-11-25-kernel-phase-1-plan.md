# Transport-neutral core, phase 1: the kernel inside `@navios/core` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `@navios/core` a transport-neutral kernel (application, transports, open modules, neutral plugins, execution context) and rebuild the HTTP application on top of it, without moving any package and without changing what an HTTP application imports or writes.

**Architecture:** Two internal entry files model the future packages. `src/kernel.mts` is what `@navios/core` will export after phase 2, and `src/transport.mts` is the future `@navios/core/transport`. Today's `src/index.mts` becomes what `@navios/server` will export: `export * from './kernel.mjs'` plus the HTTP layer, with five HTTP-typed names shadowing kernel ones. A test walks the imports reachable from the two kernel entries and fails if any reaches an HTTP file. `NaviosApplication` becomes a subclass of the kernel `Application` whose first transport is `httpTransport`.

**Tech Stack:** TypeScript, Vitest (with `*.spec-d.mts` type tests), tsdown, Yarn + Turbo, `@navios/di` 2.0, Fastify 5, Bun.

**Spec:** [`2026-11-25-core-kernel-server-split-design.md`](./2026-11-25-core-kernel-server-split-design.md), sections 5 to 10; this is phase 1 of its section 12. Phases 2 (extract `@navios/server`) and 3 (schedule, microservice, fake transport in `@navios/core/testing`) get their own plans once this one has landed.

## Global Constraints

- Branch `refactor/core-server-split`, based on `next`.
- `yarn`; one test file: `cd packages/core && yarn run -T vitest run <path>`; whole package: `yarn turbo run test:ci --filter=@navios/core`; lint: `yarn turbo run lint --filter=@navios/core`; types: `yarn turbo run check --filter=@navios/core`.
- `.mts`, no semicolons, single quotes. No decorator syntax in non-test sources (`registerInjectable`).
- Tests follow the DI rules in `CLAUDE.md`: a fresh container per test, classes declared inside the test.
- **No HTTP word in a kernel file:** status, header, cookie, route path, prefix, body. Kernel files are everything reachable from `src/kernel.mts` and `src/transport.mts`.
- **Nothing is added to the HTTP request path.** `RequestContext` gets no new instance field and no base class; new members are prototype getters. The compiled pipeline (`pipeline/`) is not edited except for import paths and type names.
- **Public API of `src/index.mts` only grows.** Every name exported today keeps its type, except `PluginApi` (Task 7), `ModuleMetadata`, `ModuleNode`, `buildModuleGraph` (Task 4) and `MethodHandlerMetadata` (Task 5).
- Performance budget against raw Fastify in the same run, from the 2.0 framework design section 11: GET no guards ≤ +1 µs; POST with schemas ≤ +1 µs; one guard ≤ +1.5 µs; one request value ≤ +1.3 µs; one request-scoped service ≤ +3 µs. The benchmark forces GC in every variant; do not remove that.
- Lifecycle order (spec 7.2). `init()`: logger → create transports in declared order → plugins → graph, module providers, module instances, `onModuleInit` → `setup(graph)` per transport in declared order → plugin `onBootstrap` hooks → `onApplicationBootstrap`. `close()`: `stop(shutdownTimeout)` on all transports concurrently → `onApplicationShutdown` in reverse → plugin `onShutdown` in reverse → dispose the container.
- Guard and interceptor order (spec 6.4): guards are module chain, class, member; interceptors are application, module chain, class, member; duplicates removed, first occurrence kept.

## Review Focus

1. A module that lists a key no transport of the application reads (`commands` in an HTTP-only app) must boot and serve. Test in Task 6.
2. When one transport's `setup` throws, every transport already created must be stopped, `init()` must reject with that error on every later call, and client error stacks must be released. Tests in Tasks 6 and 7.
3. A module-level guard in an application with two transports must run for both and see each transport's own `kind`. Test in Task 6.
4. `listen()` twice, or `start()` after `listen()`, must bind the HTTP server once and start each other transport once. Test in Task 7.
5. A controller subclass must get its own copy of each inherited member's `entries`, so declaring an endpoint on the subclass does not change the parent. Test in Task 5.

## File Structure (`packages/core/src`)

| Path | Layer | Responsibility |
|---|---|---|
| `kernel.mts` (new) | kernel | Future `@navios/core` index |
| `transport.mts` (new) | kernel | Future `@navios/core/transport` index |
| `execution/execution-context.mts` (new) | kernel | `ExecutionContext`, `HandlerInfo`, `AttributeMap` |
| `execution/context-key.mts` (moved from `context/`) | kernel | `PlainContextKey`, `createContextKey`, kernel `ContextKey`, `ContextValue` |
| `execution/context-host.mts` (moved) | kernel | `ContextHost`, `createContextHost` |
| `execution/async-context.mts` (moved) | kernel | The one `AsyncLocalStorage`; kernel `currentContext` |
| `execution/execution-context-token.mts` (new) | kernel | `ExecutionContextToken` |
| `execution/basic-execution-context.mts` (new) | kernel | `BasicExecutionContext`, the `Map`-backed implementation |
| `guards/guard.mts`, `interceptors/interceptor.mts` | kernel | Generic `Guard<Ctx>`, `Interceptor<Ctx, Result>` |
| `modules/module-options.mts` (new) | kernel | The open `ModuleOptions` interface |
| `modules/module-metadata.mts`, `module-graph.mts`, `module.mts` | kernel | Generalised |
| `metadata/member-metadata.mts` | kernel | `entries` instead of `config` |
| `metadata/handler-chain.mts` (new) | kernel | `handlerChain` |
| `transports/transport.mts` (new) | kernel | `Transport`, `TransportHost`, `defineTransport` |
| `application/application.mts`, `application-options.mts` (new) | kernel | `Application`, `createApplication` |
| `plugins/plugin.mts` | kernel | Neutral `PluginApi` |
| `context/http-context-key.mts` (new) | HTTP | HTTP `ContextKey`, `ContextValue` (include request values) |
| `context/current-request-context.mts` (new) | HTTP | HTTP `currentContext` |
| `routing/http-contracts.mts` (new) | HTTP | `HttpGuard`, `HttpInterceptor` |
| `application/http-module-options.mts` (new) | HTTP | Augments `ModuleOptions` with `prefix`, `controllers`, `requestValues` |
| `application/module-prefixes.mts` (new) | HTTP | `computeModulePrefixes` |
| `application/http-transport.mts` (new) | HTTP | `httpTransport` |
| `application/navios-application.mts` | HTTP | Facade, subclass of `Application` |
| `__tests__/helpers/fake-transport.mts` (new) | test | A recording transport that can run a handler's guards |

---

### Task 0: Record the baseline

**Files:** none changed.

- [ ] **Step 1: Run the suite and the benchmark on the untouched branch**

```bash
yarn turbo run test:ci check --filter=@navios/core --filter=@navios/adapter-fastify --filter=@navios/adapter-bun
yarn workspace @navios/adapter-fastify bench | tee /tmp/kernel-phase-1-baseline.txt
```

Expected: tests and check pass. Keep the benchmark output; Task 9 compares against it.

---

### Task 1: Execution context contracts

**Files:**
- Create: `execution/execution-context.mts`, `execution/execution-context-token.mts`, `execution/index.mts`, `context/http-context-key.mts`, `context/current-request-context.mts`
- Move: `context/context-key.mts`, `context/context-host.mts`, `context/async-context.mts` → `execution/`
- Modify: `context/request-context.mts`, `context/index.mts`, `routing/route-info.mts`, `attributes/attribute-factory.mts`, `logger/console-logger.mts`, `pipeline/compile-route.mts` (import paths only), `application/navios-application.mts` (import paths only)
- Test: `__tests__/execution-context.spec.mts`, `__type-tests__/execution-context.spec-d.mts`

**Interfaces:**
- Produces, in `execution/execution-context.mts`:

```ts
export type AttributeMap = ReadonlyMap<symbol, unknown>

export interface HandlerInfo {
  readonly module: ClassType | null
  readonly controller: ClassType
  readonly handlerName: string
  readonly guards: readonly ClassType[]
  readonly interceptors: readonly ClassType[]
  readonly attributes: {
    readonly handler: AttributeMap
    readonly controller: AttributeMap
    readonly module: AttributeMap
  }
}

export interface ExecutionContext {
  readonly kind: string
  readonly id: string
  readonly signal: AbortSignal
  readonly handler: HandlerInfo
  get<K extends ContextKey>(key: K): ContextValue<K>
  find<K extends ContextKey>(key: K): ContextValue<K> | undefined
  set<K extends ContextKey>(key: K, value: Awaited<ContextValue<K>>): void
  has(key: ContextKey): boolean
  use: ScopedContainer['getSync']
  resolve: ScopedContainer['get']
  onFinish(callback: () => void | Promise<void>): void
}
```

- `execution/context-key.mts`: `ContextKey<T = any> = PlainContextKey<T>`; `ContextValue<K> = K extends PlainContextKey<infer T> ? T : never`. `PlainContextKey` and `createContextKey` unchanged.
- `context/http-context-key.mts`: today's `ContextKey` (plain key or `RequestValueClass`) and today's `ContextValue`, under those same names. `RequestContext` and `context/index.mts` use these.
- `execution/async-context.mts`: `enableAsyncContext(): Promise<void>`, `runInContext<R>(ctx: ExecutionContext, fn: () => R): R`, `isAsyncContextEnabled(): boolean`, `currentContext(): ExecutionContext | undefined`.
- `context/current-request-context.mts`: `currentContext(): RequestContext | undefined`, which returns the kernel one when it is `instanceof RequestContext`. `context/index.mts` exports this one.
- `execution/execution-context-token.mts`: `ExecutionContextToken = InjectionToken.create<ExecutionContext>('ExecutionContext', { scope: InjectableScope.Request })`.
- `execution/context-host.mts`: `ContextHost` unchanged, plus `createContextHost(container: Container, mode: 'allow' | 'warn' | 'forbid', logger: LoggerService): ContextHost`, the body of today's `NaviosApplication.createContextHost` with the same messages.
- `RequestContext`: `implements ExecutionContext`; prototype getters `get kind(): 'http'` and `get handler(): RouteInfo` (returns `this.route`); `scopeFor` also adds `ExecutionContextToken` to the scope.
- `RouteInfo extends HandlerInfo` and keeps `method`, `path`, `endpoint`. `AttributeMap` is re-exported from `routing/route-info.mts`.
- `AttributeFactory`'s `AttributeSource` becomes `HandlerInfo | { attributes: ReadonlyMap<symbol, unknown> }`.
- `ConsoleLogger` imports `currentContext` from `execution/async-context.mjs`.

- [ ] **Step 1: Write the failing tests**

`__tests__/execution-context.spec.mts`, using `createTestClient` / the in-memory adapter as `application.spec.mts` does:

```ts
it('exposes kind and handler on the request context', async () => {
  // a GET /users/me handler that returns { kind: ctx.kind, same: ctx.handler === ctx.route }
  expect(body).toEqual({ kind: 'http', same: true })
})

it('adds no own property to a request context', async () => {
  // handler returns Object.keys(ctx)
  expect(keys).not.toContain('kind')
  expect(keys).not.toContain('handler')
})

it('resolves the neutral context token in the request scope', async () => {
  // a request-scoped service does inject(ExecutionContextToken); handler returns ctx.use(Service).ctx === ctx
  expect(body).toBe(true)
})

it('returns the request context from both currentContext functions', async () => {
  // app created with asyncContext: true
  expect(kernelCurrentContext()).toBe(ctx)
  expect(httpCurrentContext()).toBe(ctx)
})

it('reads an attribute from ctx.handler', async () => {
  expect(AttributeFactory.get(Roles, ctx.handler)).toEqual(['admin'])
})
```

`__type-tests__/execution-context.spec-d.mts`:

```ts
expectTypeOf<RequestContext>().toExtend<ExecutionContext>()
expectTypeOf<RouteInfo>().toExtend<HandlerInfo>()
expectTypeOf<ContextValue<PlainContextKey<number>>>().toEqualTypeOf<number>()
// @ts-expect-error a request value is not a kernel context key
const key: KernelContextKey = SessionValue
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd packages/core && yarn run -T vitest run src/__tests__/execution-context.spec.mts src/__type-tests__/execution-context.spec-d.mts`
Expected: FAIL, `execution/` does not exist.

- [ ] **Step 3: Implement the interfaces above**

- [ ] **Step 4: Run the new tests, then the package**

Run: `yarn turbo run test:ci check --filter=@navios/core`
Expected: PASS, including the unchanged `application.spec.mts` and `pipeline.spec.mts`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src && git commit -m "refactor(core): add a transport-neutral execution context"
```

---

### Task 2: `BasicExecutionContext`

**Files:**
- Create: `execution/basic-execution-context.mts`
- Test: `__tests__/basic-execution-context.spec.mts`

**Interfaces:**
- Consumes: `ExecutionContext`, `HandlerInfo`, `ContextHost`, `ExecutionContextToken` (Task 1).
- Produces:

```ts
export interface BasicExecutionContextInit {
  kind: string
  id: string
  handler: HandlerInfo
  host: ContextHost
  signal?: AbortSignal   // default: a signal that never aborts
}
export class BasicExecutionContext implements ExecutionContext {
  constructor(init: BasicExecutionContextInit)
  /** Runs `onFinish` callbacks in reverse order, then disposes the DI scope. Idempotent. */
  finish(): Promise<void>
}
```

`use` and `resolve` behave as on `RequestContext`: call `host.onScopedUse`, create the scope on first use, register `ExecutionContextToken`, and throw once the context has finished. `get` of an unset key throws `[Navios] Context key <name> is not set.` A callback passed to `onFinish` after `finish()` runs at once. An `onFinish` callback that throws does not stop the others.

- [ ] **Step 1: Write the failing test**

```ts
it('stores and reads keys', () => {
  ctx.set(Tenant, 'acme')
  expect(ctx.get(Tenant)).toBe('acme')
  expect(ctx.find(Missing)).toBeUndefined()
  expect(() => ctx.get(Missing)).toThrow('Context key Missing is not set')
})
it('creates one scope and disposes it on finish', async () => {
  const a = ctx.use(Scoped)          // Scoped is request-scoped with onServiceDestroy
  expect(ctx.use(Scoped)).toBe(a)
  expect(a.ctx).toBe(ctx)            // injected through ExecutionContextToken
  await ctx.finish()
  expect(a.destroyed).toBe(true)
  expect(() => ctx.use(Scoped)).toThrow()
})
it('runs finishers in reverse, once, despite a throwing one', async () => {
  // registers 'a', a thrower, 'b'
  await ctx.finish(); await ctx.finish()
  expect(order).toEqual(['b', 'a'])
})
it('calls onScopedUse', () => {
  // host.onScopedUse = vi.fn()
  ctx.use(Scoped)
  expect(onScopedUse).toHaveBeenCalledWith(Scoped)
})
```

- [ ] **Step 2: Run it and see it fail** — `yarn run -T vitest run src/__tests__/basic-execution-context.spec.mts`, FAIL: module not found.
- [ ] **Step 3: Implement `BasicExecutionContext`**
- [ ] **Step 4: Run it and see it pass**
- [ ] **Step 5: Commit** — `git commit -m "feat(core): add BasicExecutionContext for non-HTTP transports"`

---

### Task 3: Generic guards and interceptors

**Files:**
- Modify: `guards/guard.mts`, `interceptors/interceptor.mts`, `guards/index.mts`, `interceptors/index.mts`, `guards/use-guards.mts`, `interceptors/use-interceptors.mts`, `application/assemble-routes.mts`, `pipeline/*.mts` (type names only)
- Create: `routing/http-contracts.mts`
- Test: `__type-tests__/guards.spec-d.mts`

**Interfaces:**
- Produces, kernel:

```ts
export interface Guard<Ctx extends ExecutionContext = ExecutionContext> {
  canActivate(ctx: Ctx): boolean | Promise<boolean>
}
export interface Interceptor<Ctx extends ExecutionContext = ExecutionContext, Result = unknown> {
  intercept(ctx: Ctx, next: () => Promise<Result>): Result | Promise<Result>
}
```

- Produces, HTTP, in `routing/http-contracts.mts`: `type HttpGuard = Guard<RequestContext>`, `type HttpInterceptor = Interceptor<RequestContext, RouteResult>`.
- `guards/index.mts` and `interceptors/index.mts` stop exporting the type. `src/index.mts` itself gets `export type { HttpGuard as Guard, HttpInterceptor as Interceptor } from './routing/http-contracts.mjs'`, so it exports the same `Guard` and `Interceptor` types as today. `routing/index.mts` exports only the `Http*` names; Task 8 depends on no directory index exporting a shadowed name.
- `@UseGuards` accepts `new (...args: any[]) => Guard<any>`; `@UseInterceptors` likewise.

- [ ] **Step 1: Write the failing type test**

```ts
import type { Guard, Interceptor } from '../index.mjs'              // HTTP-typed
import type { Guard as KernelGuard } from '../guards/guard.mjs'

class HttpOnly implements Guard { canActivate(ctx: RequestContext) { return ctx.headers.has('x') } }
class Neutral implements KernelGuard { canActivate(ctx: ExecutionContext) { return ctx.kind !== '' } }
class Timing implements Interceptor { async intercept(ctx: RequestContext, next: () => Promise<RouteResult>) { return next() } }

expectTypeOf<Guard>().toEqualTypeOf<KernelGuard<RequestContext>>()
UseGuards(HttpOnly, Neutral)   // both accepted
```

- [ ] **Step 2: Run it and see it fail** — `yarn run -T vitest run src/__type-tests__/guards.spec-d.mts`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run `yarn turbo run test:ci check --filter=@navios/core`**, PASS
- [ ] **Step 5: Commit** — `git commit -m "refactor(core): make Guard and Interceptor generic over the context"`

---

### Task 4: Open modules and the neutral graph

**Files:**
- Create: `modules/module-options.mts`, `application/http-module-options.mts`, `application/module-prefixes.mts`
- Modify: `modules/module.mts`, `modules/module-metadata.mts`, `modules/module-graph.mts`, `modules/index.mts`, `legacy-compat/module.mts`, `application/navios-application.mts`, `application/assemble-routes.mts`, `__tests__/legacy-compat.spec.mts:60`
- Test: `__tests__/module-graph.spec.mts`, `__tests__/module-prefixes.spec.mts`

**Interfaces:**
- Produces, kernel:

```ts
// modules/module-options.mts
export interface ModuleOptions {
  imports?: ClassType[]
  providers?: Provider[]
  guards?: ClassType[]
  interceptors?: ClassType[]
  attributes?: AttributeValue[]
}

// modules/module-metadata.mts
export interface ModuleMetadata {
  imports: ClassType[]
  guards: ClassType[]
  interceptors: ClassType[]
  providers: Provider[]
  attributes: Map<symbol, unknown>
  /** Every option the kernel does not know, by option name, as written. */
  entries: Map<string, unknown>
}

// modules/module-graph.mts
export interface ModuleNode {
  module: ClassType
  providers: Provider[]
  entries: ReadonlyMap<string, unknown>
  guards: ClassType[]
  interceptors: ClassType[]
  attributes: Map<symbol, unknown>
  importers: ModuleNode[]
  /** Passed to buildModuleGraph as a root. */
  isRoot: boolean
}
export function buildModuleGraph(roots: ClassType[]): ModuleNode[]
```

- `modules/index.mts` must use `export type * from './module-options.mjs'`. An interface is only reachable for `declare module` augmentation through star re-exports; `context/index.mts` has the same note for `Register`.
- Produces, HTTP:

```ts
// application/http-module-options.mts
declare module '../modules/module-options.mjs' {
  interface ModuleOptions {
    prefix?: string
    controllers?: ClassType[]
    requestValues?: RequestValueClass[]
  }
}
export function moduleControllers(node: ModuleNode): ClassType[]            // unique, [] when absent
export function moduleRequestValues(node: ModuleNode): RequestValueClass[]  // [] when absent

// application/module-prefixes.mts
/** Each module's route prefix: every importer's prefix, then its own. */
export function computeModulePrefixes(graph: readonly ModuleNode[], globalPrefix: string): Map<ClassType, string>
```

- Prefix rule: a root's prefix set starts with `joinPaths(globalPrefix, own)`; each importer contributes `joinPaths(importerPrefix, own)` for each of its prefixes. A module with at least one controller and more than one distinct prefix throws today's message, unchanged: ``[Navios] Module X is imported under two different prefixes ("a" and "b"). A module with controllers can be mounted once.`` A module without controllers takes the first. Import cycles must terminate.
- Rules for `guards`, `interceptors`, `attributes` and node order are unchanged from today's `module-graph.mts`.

- [ ] **Step 1: Write the failing tests**

`module-graph.spec.mts`:

```ts
it('keeps unknown options in entries, as written', () => {
  // registerModule(M, { imports: [Shared], commands: [A], controllers: [B] } as never)
  const node = buildModuleGraph([M]).at(-1)!
  expect(node.entries.get('commands')).toEqual([A])
  expect(node.entries.get('controllers')).toEqual([B])
  expect(node.entries.has('imports')).toBe(false)
})
it('orders dependencies first and links importers', () => {
  const [shared, a, root] = buildModuleGraph([Root])   // Root -> A -> Shared, Root -> Shared
  expect(shared.importers.map((n) => n.module)).toEqual(expect.arrayContaining([A, Root]))
  expect(root.isRoot).toBe(true)
  expect(shared.isRoot).toBe(false)
})
it('unions guards over every import path, outermost first', () => { /* existing rule */ })
it('lets the nearest module win for attributes', () => { /* existing rule */ })
it('terminates on an import cycle', () => { expect(buildModuleGraph([CycleA])).toHaveLength(2) })
```

`module-prefixes.spec.mts`:

```ts
it('joins the global prefix, importers and own', () => {
  expect(computeModulePrefixes(graph, '/api').get(Users)).toBe('/api/admin/users')
})
it('rejects a module with controllers under two prefixes', () => {
  expect(() => computeModulePrefixes(graph, '')).toThrow('is imported under two different prefixes')
})
it('accepts a module without controllers under two prefixes', () => {
  expect(() => computeModulePrefixes(graph, '')).not.toThrow()
})
```

Change `legacy-compat.spec.mts:60` to `expect(getModuleMetadata(LegacyModule).entries.get('prefix')).toBe('legacy')`.

- [ ] **Step 2: Run them and see them fail**
- [ ] **Step 3: Implement**; `NaviosApplication.initialise` and `assembleRoutes` switch to `buildModuleGraph(roots)`, `computeModulePrefixes`, `moduleControllers`, `moduleRequestValues`.
- [ ] **Step 4: Run `yarn turbo run test:ci check --filter=@navios/core`**, PASS
- [ ] **Step 5: Commit** — `git commit -m "refactor(core): open module options and take prefixes out of the graph"`

---

### Task 5: Member entries and `handlerChain`

**Files:**
- Create: `metadata/handler-chain.mts`
- Modify: `metadata/member-metadata.mts`, `metadata/index.mts`, `handlers/endpoint.mts`, `handlers/endpoint-declaration.mts`, `application/assemble-routes.mts`
- Test: `__tests__/member-metadata.spec.mts`, `__tests__/handler-chain.spec.mts`

**Interfaces:**
- Produces:

```ts
// metadata/member-metadata.mts
export interface MethodHandlerMetadata extends HandlerExtras {
  name: string
  /** A transport's own declaration for this member, under the transport's symbol. */
  entries: Map<symbol, unknown>
}

// handlers/endpoint-declaration.mts (HTTP)
export const EndpointEntryKey: unique symbol   // Symbol.for('navios.server.endpoint')
export function memberEndpoint(member: MethodHandlerMetadata): RouteEndpointConfig | null

// metadata/handler-chain.mts
export interface HandlerChainInput {
  application: readonly ClassType[]                     // application-wide interceptors
  node: Pick<ModuleNode, 'guards' | 'interceptors'>
  owner: { guards: readonly ClassType[]; interceptors: readonly ClassType[] }
  member: { guards: readonly ClassType[]; interceptors: readonly ClassType[] }
}
export function handlerChain(input: HandlerChainInput): { guards: ClassType[]; interceptors: ClassType[] }
```

- Inherited members are copied with `entries: new Map(value.entries)`.
- `assembleRoutes` builds `guards` and `interceptors` with `handlerChain`; its "has guards, interceptors or attributes but is not a handler" error is raised when `memberEndpoint(member)` is `null`.

- [ ] **Step 1: Write the failing tests**

```ts
it('gives a subclass its own entries', () => {
  // Parent has @Endpoint(getUser) on show(); Child extends Parent and re-declares show() with @Endpoint(getUserV2)
  expect(memberEndpoint(getControllerMetadata(Parent).members.get('show')!)).toBe(endpointConfig(getUser))
  expect(memberEndpoint(getControllerMetadata(Child).members.get('show')!)).toBe(endpointConfig(getUserV2))
})

it('orders the chain and removes duplicates', () => {
  expect(handlerChain({
    application: [App],
    node: { guards: [G1], interceptors: [I1] },
    owner: { guards: [G2, G1], interceptors: [I2] },
    member: { guards: [G3], interceptors: [App, I3] },
  })).toEqual({ guards: [G1, G2, G3], interceptors: [App, I1, I2, I3] })
})
```

- [ ] **Step 2: Run them and see them fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run `yarn turbo run test:ci check --filter=@navios/core`**, PASS
- [ ] **Step 5: Commit** — `git commit -m "refactor(core): store handler declarations as transport entries"`

---

### Task 6: Transports and the kernel `Application`

**Files:**
- Create: `transports/transport.mts`, `transports/index.mts`, `application/application.mts`, `application/application-options.mts`, `__tests__/helpers/fake-transport.mts`
- Modify: `plugins/plugin.mts` (add the neutral API beside the current one; Task 7 removes the HTTP members)
- Test: `__tests__/kernel-application.spec.mts`, `__type-tests__/transports.spec-d.mts`

**Interfaces:**
- Consumes: `buildModuleGraph`, `ModuleNode` (Task 4); `handlerChain` (Task 5); `createContextHost`, `enableAsyncContext` (Task 1); `BasicExecutionContext` (Task 2).
- Produces:

```ts
// transports/transport.mts
export interface TransportHost {
  readonly container: Container
  readonly logger: LoggerService
  readonly contextHost: ContextHost
  readonly asyncContext: boolean
  /** Application-wide interceptors, outermost first. Complete once setup() is called. */
  readonly interceptors: readonly ClassType[]
}
export interface Transport {
  setup(graph: readonly ModuleNode[]): void | Promise<void>
  start?(): void | Promise<void>
  stop(timeoutMs: number): void | Promise<void>
}
export interface TransportDefinition<Options, T extends Transport> {
  name: string
  create(host: TransportHost, options: Options): T | Promise<T>
}
export interface TransportInstance<T extends Transport = Transport> {
  readonly definition: TransportDefinition<any, T>
  readonly options: unknown
  readonly instanceName: string     // defaults to definition.name
}
export interface TransportFactory<Options, T extends Transport> {
  (options: Options, instanceName?: string): TransportInstance<T>
  readonly definition: TransportDefinition<Options, T>
}
export function defineTransport<Options = void, T extends Transport = Transport>(
  definition: TransportDefinition<Options, T>,
): TransportFactory<Options, T>

// application/application-options.mts
export interface ApplicationOptions {
  transports?: TransportInstance[]
  plugins?: PluginInstance[]
  providers?: Provider[]
  container?: Container
  logger?: LoggerService | LogLevel[] | false
  asyncContext?: boolean
  requestScopedServices?: 'allow' | 'warn' | 'forbid'
  shutdownTimeout?: number          // default 10000
}

// application/application.mts
export class Application {
  readonly container: Container
  constructor(appModule: ClassType, options?: ApplicationOptions)
  usePlugin(plugin: PluginInstance): this
  intercept(interceptor: ClassType): this
  /** Throws before init(), and when the application has no such transport. */
  transport<T extends Transport>(factory: TransportFactory<any, T>, instanceName?: string): T
  findTransport<T extends Transport>(factory: TransportFactory<any, T>, instanceName?: string): T | undefined
  get: Container['get']
  init(): Promise<this>
  start(): Promise<this>
  close(signal?: string): Promise<void>
  dispose(): Promise<void>
  [Symbol.asyncDispose](): Promise<void>
  enableShutdownHooks(signals?: NodeJS.Signals[]): this
  protected readonly logger: LoggerInstance
}
export function createApplication(appModule: ClassType, options?: ApplicationOptions): Application
```

- The constructor throws `[Navios] Two transports are named "<instanceName>".` for a duplicate `(definition, instanceName)` pair.
- `init()` and `close()` follow the lifecycle order in Global Constraints. The logger setup, provider overrides for a supplied container, module instantiation, bootstrap and shutdown loops are today's code from `NaviosApplication`, moved.
- If anything in `init()` throws after transports were created, the application calls `stop(0)` on each created transport, ignoring errors, and rethrows. Later `init()` calls reject with the same error. This refines spec 7.2 ("the caller closes it"): the container is still the caller's to close, but no transport is left half-open.
- `start()` calls each transport's `start` at most once across any number of calls.
- A `stop` that rejects is logged with `Error stopping transport <instanceName>` and does not prevent the other stops or the shutdown hooks.
- `PluginApi` gains `transport<T>(factory, instanceName?): T | undefined`, and `onBootstrap` hooks are called with no arguments by the kernel.
- `__tests__/helpers/fake-transport.mts`: `fakeTransport = defineTransport<{ kind: string; entry: string; log: string[]; failSetup?: boolean; failStop?: boolean }, FakeTransport>`. `setup` records `` `${kind}:setup` `` and collects `node.entries.get(entry)`; `start`/`stop` record likewise. `FakeTransport.handlers: ClassType[]`, and `run(handlerClass): Promise<boolean>` builds a `BasicExecutionContext` with its `kind`, resolves the guards from `handlerChain` for that class's module and returns whether all allowed.

- [ ] **Step 1: Write the failing tests**

```ts
it('runs init, start and close in order', async () => {
  // two fake transports 'a' and 'b', one plugin with onBootstrap/onShutdown, one module with onModuleInit
  // and a service with onApplicationBootstrap / onApplicationShutdown
  await app.start(); await app.close()
  expect(log).toEqual([
    'a:create', 'b:create', 'plugin:setup', 'module:init', 'a:setup', 'b:setup',
    'plugin:bootstrap', 'service:bootstrap', 'a:start', 'b:start',
    'a:stop', 'b:stop', 'service:shutdown', 'plugin:shutdown',
  ])
})
it('gives each transport only its own entries and ignores unread keys', async () => {
  // @Module({ commands: [Cmd], jobs: [Job], unread: [X] }); transports read 'commands' and 'jobs'
  expect(app.transport(fakeTransport, 'cli').handlers).toEqual([Cmd])
  expect(app.transport(fakeTransport, 'jobs').handlers).toEqual([Job])
})
it('boots with no transports', async () => { await createApplication(M).start() })
it('starts each transport once', async () => {
  await app.start(); await app.start()
  expect(log.filter((l) => l === 'a:start')).toHaveLength(1)
})
it('stops the others when one stop rejects', async () => {
  await app.close()
  expect(log).toContain('b:stop'); expect(log).toContain('service:shutdown')
})
it('stops created transports and stays failed when setup throws', async () => {
  await expect(app.init()).rejects.toThrow('setup failed')
  expect(log).toContain('a:stop')
  await expect(app.init()).rejects.toThrow('setup failed')
})
it('runs a module-level guard on every transport with its own kind', async () => {
  // KindGuard pushes ctx.kind; module lists guards: [KindGuard] and one handler per transport
  await cli.run(Cmd); await jobs.run(Job)
  expect(kinds).toEqual(['cli', 'jobs'])
})
it('rejects two transports with one name', () => {
  expect(() => createApplication(M, { transports: [t('a'), t('a')] })).toThrow('Two transports are named "a"')
})
it('lets a plugin reach a transport and miss an absent one', async () => {
  expect(seen.present).toBe(app.transport(fakeTransport, 'a'))
  expect(seen.absent).toBeUndefined()
})
```

`transports.spec-d.mts`: `expectTypeOf(app.transport(fakeTransport)).toEqualTypeOf<FakeTransport>()` and `expectTypeOf(app.findTransport(fakeTransport)).toEqualTypeOf<FakeTransport | undefined>()`.

- [ ] **Step 2: Run them and see them fail** — `yarn run -T vitest run src/__tests__/kernel-application.spec.mts`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run `yarn turbo run test:ci check --filter=@navios/core`**, PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(core): add the kernel application and the transport contract"`

---

### Task 7: `httpTransport`, the facade, the neutral plugin API

**Files:**
- Create: `application/http-transport.mts`
- Modify: `application/navios-application.mts`, `application/navios-application-options.mts`, `application/navios-factory.mts`, `application/index.mts`, `plugins/plugin.mts`, `__tests__/application.spec.mts:895`
- Modify, other packages: `packages/adapter-xml/src/plugin/xml-plugin.mts:43`, `packages/openapi/src/plugin/openapi-plugin.mts:138`, `packages/otel/src/otel-plugin.mts:87`
- Test: `__tests__/http-transport.spec.mts`; existing `application.spec.mts`, `conformance.in-memory.spec.mts`

**Interfaces:**
- Consumes: `Application`, `defineTransport`, `TransportHost` (Task 6); `computeModulePrefixes`, `moduleRequestValues` (Task 4).
- Produces:

```ts
// application/http-transport.mts
export interface HttpTransportOptions<Env extends HttpAdapterEnvironment = ApplicationEnvironment> {
  adapter: AdapterDefinition<Env>
  /** When given, start() listens with these. */
  listen?: Env['listenOptions']
  globalPrefix?: string
  validateResponses?: 'always' | 'development' | 'never'
  exposeErrorDetails?: boolean
  clientErrorStacks?: ClientErrorStacks
}
export interface HttpTransport<Env extends HttpAdapterEnvironment = ApplicationEnvironment> extends Transport {
  readonly adapter: HttpAdapter<Env>
  readonly server: Env['server']
  routes(): readonly RouteInfo[]
  /** Binds once; a second call returns the first address. */
  listen(options: Env['listenOptions']): Promise<string>
  inject(request: TestRequest): Promise<TestResponse>
  mapError<E>(errorClass: ErrorClass<E>, mapper: ErrorMapper<E>): void
  /** Before setup() only. */
  encoder(kind: string, encoder: ResponseEncoder): void
  /** Around every HTTP route, inside application-wide interceptors. Before setup() only. */
  intercept(interceptor: ClassType): void
}
export const httpTransport: TransportFactory<HttpTransportOptions<any>, HttpTransport<any>>   // name: 'http'
```

- `create`: acquires client error stacks, builds the `ErrorPipeline` from the four responder tokens, creates the adapter. `setup`: prefixes, the `requestValues` check, `assembleRoutes`, `register`, `setNotFound`, `adapter.ready()`. `start`: `listen(options.listen)` when given and not yet listening. `stop`: `adapter.close(timeoutMs)`, then releases client error stacks, also when `close` throws.
- `PluginApi` loses `adapter`, `encoder`, `mapError`; `onBootstrap(hook: () => void | Promise<void>)`.
- `NaviosApplication<Env> extends Application`. Its options are today's `NaviosApplicationOptions` plus `transports?: TransportInstance[]`; it builds `[httpTransport(httpOptions), ...transports]`. It keeps `adapter`, `getServer()`, `routes()`, `mapError()`, `inject()`, `listen()`, `intercept()` with today's signatures:
  - `mapError` before `init()` queues and applies after the transport exists; after, forwards.
  - `intercept` forwards to the HTTP transport (spec call 20).
  - `inject(request)`: `init()`, then the transport's `inject`. Starts no transport.
  - `listen(options)`: `init()`, the transport's `listen(options)`, then `start()`. Returns the address and logs `Navios is listening on <address>` as today.
- `NaviosFactory.create` is unchanged for callers.
- `src/index.mts` additionally exports `httpTransport`, `HttpTransport`, `HttpTransportOptions`, `Application`, `createApplication`, `ApplicationOptions`, `defineTransport` and the transport types.
- Plugin call sites: `xml-plugin` uses `api.transport(httpTransport)` and its `encoder`; `openapi-plugin` reads `http.routes()` inside `onBootstrap`; `otel-plugin` calls `http.intercept(OtelHttpInterceptor)`. Each throws `[Navios] <package> needs the HTTP transport.` when the transport is absent.

- [ ] **Step 1: Write the failing tests** (`http-transport.spec.mts`, in-memory adapter)

```ts
it('serves from a kernel application', async () => {
  const app = createApplication(AppModule, { transports: [httpTransport({ adapter: defineInMemoryEnvironment() })] })
  await app.init()
  const res = await app.transport(httpTransport).inject({ method: 'GET', url: '/ping' })
  expect(res.status).toBe(200)
})
it('serves a module that also lists a key nobody reads', async () => {
  // @Module({ controllers: [Ping], commands: [X] } as never)
  expect((await app.inject({ method: 'GET', url: '/ping' })).status).toBe(200)
})
it('starts the other transports on listen, and only once', async () => {
  // NaviosFactory.create(M, { adapter, transports: [fakeTransport({ kind: 'q', ... })] })
  await app.inject({ method: 'GET', url: '/ping' })
  expect(log).not.toContain('q:start')
  const a = await app.listen({ port: 0 }); const b = await app.listen({ port: 0 }); await app.start()
  expect(a).toBe(b)
  expect(log.filter((l) => l === 'q:start')).toHaveLength(1)
})
it('applies http.intercept to routes only', async () => {
  // plugin does api.transport(httpTransport)!.intercept(Http); fake transport runs a handler
  expect(httpInterceptorCalls).toBe(1)   // one HTTP request, one fake run
})
it('releases client error stacks when another transport fails setup', async () => {
  await expect(app.init()).rejects.toThrow('setup failed')
  expect(clientErrorStacksEnabled()).toBe(false)   // same probe client-error-stacks.spec.mts uses
})
it('gives plugins the routes through the transport', async () => {
  // plugin: api.onBootstrap(() => { seen = api.transport(httpTransport)!.routes().length })
  expect(seen).toBe(1)
})
```

Change `application.spec.mts:895` to read routes through `pluginApi.transport(httpTransport)`.

- [ ] **Step 2: Run them and see them fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run core and its dependents**

Run: `yarn turbo run test:ci check --filter=@navios/core --filter=@navios/adapter-xml --filter=@navios/openapi --filter=@navios/otel --filter=@navios/schedule`
Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -m "refactor(core): run HTTP as a transport of the kernel application"`

---

### Task 8: Kernel entries and the boundary test

**Files:**
- Create: `kernel.mts`, `transport.mts`
- Modify: `index.mts`
- Test: `__tests__/kernel-boundary.spec.mts`

**Interfaces:**
- `kernel.mts` exports: `export * from '@navios/di'`; `attributes`, `config`, `logger`; `Module`, `registerModule`, `ModuleOptions` (star), `getModuleMetadata`, `hasModuleMetadata`, `ModuleMetadata`; `definePlugin` and plugin types; lifecycle hook types; `Application`, `createApplication`, `ApplicationOptions`; `Transport`, `TransportInstance`, `TransportFactory`; `ExecutionContext`, `HandlerInfo`, `AttributeMap`, `ExecutionContextToken`, `createContextKey`, `PlainContextKey`, kernel `ContextKey`, `ContextValue`, kernel `currentContext`; generic `Guard`, `Interceptor`, `UseGuards`, `UseInterceptors`.
- `transport.mts` exports: `defineTransport`, `TransportDefinition`, `TransportHost`; `buildModuleGraph`, `ModuleNode`; `handlerChain`, `HandlerChainInput`; `memberMetadata`, `MembersKey`, `MethodHandlerMetadata`, `HandlerExtras`, `requireMetadata`, `own`, `classAttributes`, `classGuards`, `classInterceptors`; `runInContext`, `enableAsyncContext`, `isAsyncContextEnabled`; `BasicExecutionContext`, `ContextHost`, `createContextHost`.
- `index.mts`: `export * from './kernel.mjs'`, then the HTTP layer. Each of the five shadowed names is an **explicit named export written in `index.mts`**, from its HTTP file: `Guard`, `Interceptor` (Task 3), and `currentContext`, `ContextKey`, `ContextValue`, which `context/index.mts` therefore stops exporting. An explicit export takes precedence over `export *`; two `export *` of one name is error TS2308.
- No change to `package.json` exports or `tsdown.config.mts`; the two files become package entries in phase 2.

- [ ] **Step 1: Write the failing test**

```ts
const HTTP_DIRS = ['adapter', 'pipeline', 'routing', 'errors', 'responses', 'sse', 'controllers',
  'handlers', 'conformance', 'testing', 'context']
const HTTP_FILES = ['application/navios-application.mts', 'application/navios-application-options.mts',
  'application/navios-factory.mts', 'application/assemble-routes.mts', 'application/http-transport.mts',
  'application/http-module-options.mts', 'application/module-prefixes.mts']

it.each(['kernel.mts', 'transport.mts'])('%s reaches no HTTP file', (entry) => {
  // follow every relative `from '...mjs'` (import and export, type-only included) from src/<entry>
  expect(reached.filter(isHttp)).toEqual([])
  expect(packageImports).toEqual(expect.not.arrayContaining(['@navios/builder']))
})
it('index exports the HTTP-typed names', () => {
  expectTypeOf<import('../index.mjs').Guard>().toEqualTypeOf<KernelGuard<RequestContext>>()
})
it('index exports everything it exported before', () => {
  // snapshot of Object.keys(await import('../index.mjs')).sort(), taken in Step 1 from the baseline commit
  expect(after).toEqual(expect.arrayContaining(before))
})
```

Generate `before` on the Task 0 commit and commit it as `__tests__/fixtures/index-exports.json`.

- [ ] **Step 2: Run it and see it fail** — the entry files do not exist.
- [ ] **Step 3: Create the entries; move whatever the boundary test reports until it passes.** A kernel file that needs an HTTP type is a design error in an earlier task; fix it there, not with an exception in the test.
- [ ] **Step 4: Run `yarn turbo run test:ci check lint --filter=@navios/core`**, PASS
- [ ] **Step 5: Commit** — `git commit -m "refactor(core): add kernel entry files and enforce the boundary"`

---

### Task 9: Whole-repository verification

**Files:** none, unless a check fails.

- [ ] **Step 1: Build, check, lint and test everything**

Run: `yarn build && yarn turbo run check lint test:ci`
Expected: PASS. `@navios/microservice` must still build; it does not use the changed metadata types.

- [ ] **Step 2: Conformance on both adapters**

Run: `yarn turbo run test:ci --filter=@navios/adapter-fastify --filter=@navios/adapter-bun`
Expected: PASS with no test edited.

- [ ] **Step 3: Benchmark against the baseline**

Run: `yarn workspace @navios/adapter-fastify bench | tee /tmp/kernel-phase-1-after.txt`
Expected: every Navios-minus-Fastify delta within the budget in Global Constraints, and within noise (±0.1 µs) of `/tmp/kernel-phase-1-baseline.txt`. A regression means something reached the request path: check `RequestContext`'s shape (Task 1) and that `pipeline/` is unchanged.

- [ ] **Step 4: Confirm the public surface**

Run: `git diff next -- packages/core/package.json packages/core/tsdown.config.mts`
Expected: no output.

- [ ] **Step 5: Commit any fixes** — `git commit -m "chore(core): fix issues found verifying the kernel split"`
