# Navios 2.0 Phase 1: `@navios/di` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the async, string-named resolver in `@navios/di` with the sync-first, provider-based container described in section 5 of the design.

**Architecture:** One resolution engine (`src/internal/engine.mts`) built around a module-level construction-frame stack, entries stored in `Map<InjectionToken, Entry>`, and provider records attached to tokens. `Container` and `ScopedContainer` are thin facades over the engine. The old `internal/` tree (name resolver, scope tracker, unified storage, resolution context, ALS shims) and `Registry` are deleted.

**Tech Stack:** TypeScript, Vitest (`*.spec.mts`, `*.spec-d.mts`), tsdown, Yarn + Turbo. Standard Schema types are inlined (no new dependency).

**Spec:** [`2026-11-24-navios-2-0-framework-design.md`](./2026-11-24-navios-2-0-framework-design.md), sections 5, 6.11 (DI parts), 11 (items 1 to 6) and 13.

## Global Constraints

- Branch `feat/v2-di`, based on `next`. `@navios/core` and every package that depends on the removed DI APIs will not build on this branch until phase 2; that is accepted by the design (section 12).
- `yarn`, not `npm`. Tests: `yarn run -T vitest run` inside `packages/di`. Lint: `yarn turbo run lint --filter=@navios/di`.
- `.mts` sources, no semicolons, single quotes.
- No decorator syntax in non-test sources of `packages/di` (design section 10); classes register with `registerInjectable`.
- `zod` is a dev dependency only. No runtime import of `zod` or `node:async_hooks` in `packages/di/src` outside tests.
- Baseline before this plan: 538 passing tests in `packages/di`.
- Performance targets (design section 11): `get` of a ready singleton not slower than 0.39 µs; `get` transient with one ready dependency at most 1.2 µs; scope create + one request-scoped `get` (2 ready deps) + dispose at most 1.5 µs.

## Review Focus

1. A token bound to a falsy value (`0`, `''`, `false`, `null`) must inject as that value. Test in Task 3.
2. Two concurrent `get()` calls for the same not-yet-built singleton with an async `onServiceInit` must produce one instance and one init call. Test in Task 3.
3. A constructor that throws must leave nothing in the store, so the next `get()` retries and can succeed. Test in Task 3.
4. Disposing a scope must unlink its entries from the singletons they depend on (no growth of a singleton's dependents set across 10,000 scopes). Test in Task 5.
5. Args that are not plain JSON (a class instance, a function) must not collide: two different instances as args give two entries. Test in Task 1.

## File Structure

| File | Responsibility |
|---|---|
| `src/schema/standard-schema.mts` | Inlined `StandardSchemaV1` types, `InferInput`, `InferOutput`, `validateSync` |
| `src/internal/args-key.mts` | `argsKey(value): string`, deterministic and collision-free |
| `src/token/injection-token.mts` | `InjectionToken`, `BoundInjectionToken`, `FactoryInjectionToken`; no ids |
| `src/token/provider.mts` | `ProviderRecord`, `provide()`, `registerInjectable()`, `registerFactory()` |
| `src/internal/entry.mts` | `Entry`, `EntryStatus`, `Store` |
| `src/internal/engine.mts` | Frames, `resolve`, construction, init, replay, plans, cycles, destruction |
| `src/injectors.mts` | `inject`, `optional`, `asyncInject` |
| `src/container/container.mts`, `scoped-container.mts` | Public containers |
| `src/testing/*.mts` | `TestContainer`, `UnitTestContainer` ported |

---

### Task 1: Schema types, args key, errors

**Files:** Create `src/schema/standard-schema.mts`, `src/internal/args-key.mts`; modify `src/errors/di-error.mts`; tests `src/__tests__/args-key.spec.mts`, `src/__tests__/standard-schema.spec.mts`.

**Interfaces — Produces:**
- `StandardSchemaV1<Input, Output>`, `InferInput<S>`, `InferOutput<S>`
- `validateSync(schema, value, tokenName): unknown` — returns the validated value; throws `DIError` `TokenValidationError` on issues or when `validate` returns a promise
- `argsKey(value: unknown): string`
- New `DIErrorCode`s: `ProviderConflict`, `AsyncInitRequired`, `ContainerDisposed`. Removed: `PriorityConflictError`, `StorageError`, `FactoryTokenNotResolved`.

- [ ] Tests: `argsKey({a:1,b:{x:1}}) === argsKey({b:{x:1},a:1})`; `argsKey({n:{x:1}}) !== argsKey({n:{x:2}})`; `argsKey('1') !== argsKey(1)`; two distinct class instances give distinct keys, the same instance gives the same key; `validateSync` returns parsed output for zod, valibot and arktype schemas, throws `TokenValidationError` on issues and on an async validator.
- [ ] Implement, run, commit.

### Task 2: Tokens and providers

**Files:** Rewrite `src/token/injection-token.mts`; create `src/token/provider.mts`; rewrite `src/decorators/*.mts`; delete `src/token/registry.mts`; test `src/__tests__/provider.spec.mts`.

**Interfaces — Produces:**
```ts
type ProviderRecord = {
  token: InjectionToken<any, any>
  kind: 'class' | 'factory' | 'value' | 'function'
  target?: ClassType
  value?: unknown
  fn?: (ctx: FactoryContext, args: unknown) => unknown
  scope: InjectableScope
  plan: PlanEntry[] | null
}
type Provider = { token: InjectionToken<any, any>; record: ProviderRecord }
function provide(token, impl: ClassType | { value } | { class, scope? } | { factory, scope? }): Provider
function registerInjectable(target, options?: { scope?, token?, schema? }): InjectionToken
function registerFactory(target, options?: { scope?, token? }): InjectionToken
InjectionToken.create(name, schemaOrOptions?: Schema | { schema?, scope? })
token.provider: ProviderRecord | undefined   // the default
```
- A second default for one token replaces the first when both classes have the same `name` (module reload) and throws `ProviderConflict` otherwise.
- `InjectableOptions.registry` and `.priority` are removed.

- [ ] Tests: two classes with identical source get distinct tokens; `@Injectable({ token })` sets `token.provider`; conflicting default throws `ProviderConflict`; same-name default replaces; `provide(Token, { value: 0 })` yields a `value` record.
- [ ] Implement, run, commit.

### Task 3: Engine — sync-first resolution

**Files:** Create `src/internal/entry.mts`, `src/internal/engine.mts`, `src/injectors.mts`; rewrite `src/container/container.mts`; test `src/__tests__/engine.spec.mts`.

**Interfaces — Produces:**
```ts
class Container {
  constructor(options?: { providers?: Provider[]; logger?: Console | null })
  get(token, args?): Promise<T>
  getSync(token, args?): T                 // throws AsyncInitRequired when pending
  tryGetSync(token, args?): T | null       // never constructs
  provide(token, impl): void               // throws once the token has an entry
  decorate(token, fn: (instance, info: { token, args }) => unknown): void
  addInstance(token, value): void
  isRegistered(token): boolean
  ready(): Promise<void>
}
inject(token, args?): T
optional(token, args?): T | null
asyncInject(token, args?): Promise<T>
```
Engine rules are the design's 5.3 verbatim: frame stack; `inject()` builds nested; non-thenable `onServiceInit` is ready at once; first-time construction with a pending dependency replays once; plan recorded on first success and pre-resolved on later builds; transients built in a discarded pass are reused by the replay; cycles from the stack; cross-task cycles from wait edges; singleton construction always resolves against the root container.

- [ ] Tests (design acceptance 2, 3, 5, 6 plus Review Focus 1 to 3): constructed once cold with sync deps; twice cold and once warm with an async-initialised dep; `inject(Transient)` twice gives two instances; conditional `inject()` works; `A → B → A` throws `CircularDependency` with the path under `NODE_ENV=production`; cross-task cycle fails instead of hanging; `optional()` returns `null` for an unregistered class and rethrows a constructor error; `FactoryInjectionToken` factory runs once per container and once more in a second container; falsy values inject as themselves; concurrent `get()` yields one instance; a throwing constructor is retried on the next `get()`; `decorate` wraps before the instance is observed; `getSync` throws `AsyncInitRequired` for an async-initialised service.
- [ ] Implement, run, commit.

### Task 4: Scope

**Files:** Rewrite `src/container/scoped-container.mts`; test `src/__tests__/scope.spec.mts`.

**Interfaces — Produces:** `container.createScope(metadata?): ScopedContainer`; `ScopedContainer` has `get`, `getSync`, `tryGetSync`, `addInstance`, `getMetadata`, `setMetadata`, `dispose`, `[Symbol.asyncDispose]`, `parent`.

- [ ] Tests (acceptance 4): singleton injecting a request-scoped service throws `ScopeMismatchError` whose message contains both class names; the same through a transient; `Container.get(RequestScoped)` throws `ScopeMismatchError`; two scopes get distinct request instances and share singletons; a scope-only token (`{ scope: Request }`, no provider) resolves a value added with `addInstance` and is a `ScopeMismatchError` from the root; `await using` disposes; using a disposed scope throws `ContainerDisposed`.
- [ ] Implement, run, commit.

### Task 5: Destruction and invalidation

**Files:** Modify `src/internal/engine.mts`, both containers; test `src/__tests__/lifecycle.spec.mts`.

**Interfaces — Produces:** `invalidate(instance): Promise<void>`, `onInvalidate(token, args, listener): () => void`, `dispose(): Promise<void>`.

- [ ] Tests: `onServiceDestroy` runs on dispose in reverse creation order; invalidating a service destroys its dependents first and fires `onInvalidate`; a listener on one scope does not fire for another; after invalidation the next `get()` builds a new instance; transients injected into a service are destroyed with it; Review Focus 4.
- [ ] Implement, run, commit.

### Task 6: Testing containers

**Files:** Rewrite `src/testing/test-container.mts`, `unit-test-container.mts`, `types.mts`; port `test-container.spec.mts`, `unit-test-container.spec.mts`.

- [ ] Keep every public method. `bind().toValue/toClass/toFactory` map to `provide`. `getDependencyGraph()` is built from entry links. `TestContainerOptions.parentRegistry` is removed.
- [ ] Port specs, run, commit.

### Task 7: Remove old internals, port suites, type tests

- [ ] Delete `src/internal/{context,core,holder,lifecycle}`, `stub-factory-class.mts`, `utils/get-injectors.mts`, `utils/default-injectors.mts`, and the specs that test only them (`circular-detector`, `resolution-context`, `scope-tracker`, `scope-upgrade`, `unified-storage`, `token-resolver`, `registry`, `get-injectors`, `e2e.browser`).
- [ ] Port behaviour suites to the new API: `container`, `scoped-container`, `e2e`, `concurrent`, `injection-token`, `di-error`, `library-findings`, `gc/*`. A test asserting removed behaviour (priorities, scope upgrade, "Wrong token order", hashed ids) is deleted, not rewritten to pass.
- [ ] Update `__type-tests__` for Standard Schema types; all must compile.
- [ ] Remove the browser build and the `browser` export condition; remove the SWC plugin from `tsdown.config.mts`; drop `node:async_hooks` from externals.
- [ ] `yarn run -T vitest run`, `yarn turbo run lint --filter=@navios/di`, `yarn turbo run build --filter=@navios/di`. Commit.

### Task 8: Benchmark and docs

- [ ] `packages/di/benchmarks/di.bench.mts` (vitest bench) with the three cases from Global Constraints plus hand-built baseline. Record results in this file.
- [ ] Update `packages/di/README.md` and the DI section of the root `CLAUDE.md` (no `Registry`; `provide`; `createScope`).
- [ ] Commit.

### Task 9: `@navios/di-react`

- [ ] Replace `calculateInstanceName` + `getEventBus()` with `onInvalidate`; `beginRequest` with `createScope`; the suspense cache with a `WeakMap` keyed by token. Run its tests. Commit.

## Results

_Filled in during execution._
