# @navios/di v2 Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship `@navios/di` v2 with field-decorator injection, plugin/middleware extension points, Standard Schema support, a unified `Token`, dropped runtime scope upgrades, a slim Container public surface — then migrate every downstream package and example to the new API.

**Design doc:** [docs/plans/2026-05-15-di-v2-overhaul-design.md](docs/plans/2026-05-15-di-v2-overhaul-design.md)

**Architecture:** Hard cut on a single branch — no compat shims, no deprecation cycle. Build the new package surface alongside the old (additive Token methods, new `@Inject*` decorators in new files), then do a coordinated rewrite of `ServiceInitializer`/`InstanceResolver` that deletes the old `inject()` machinery in one commit, then migrate the rest of the monorepo.

**Tech Stack:** TypeScript 5.9+, Stage-3 decorators (native in Bun, supported by tsc), vitest, Standard Schema v1, Zod v4 (in tests / one of many valid validators), tsdown for builds.

---

## Working agreements

- **Branch:** keep working in the current worktree (`claude/relaxed-bhaskara-977c6f`).
- **Test runner:** `yarn turbo run test:ci --filter=@navios/di` for the DI package; `yarn turbo run test:ci` for the full monorepo.
- **Type-check:** `yarn turbo run check --filter=@navios/di` (or the relevant package). Type tests use vitest `expectTypeOf` via `*.spec-d.mts`.
- **Lint:** `yarn turbo run lint --filter=@navios/di` after material changes.
- **Commit style:** Conventional Commits — `feat(di)!:`, `refactor(di)!:`, `test(di):`, `chore(di):`, `docs(di):`. `!` on every breaking commit.
- **TDD:** every new behavior gets a failing test first. Use @superpowers:test-driven-development.
- **Verify before claiming done:** every task ends with a commit AND a passing `test:ci` + `check`. Use @superpowers:verification-before-completion.
- **Frequent commits:** one logical step per commit. Don't batch.
- **Bump version:** `@navios/di` jumps to `2.0.0` at the very end of phase 6 (last DI-package commit before consumer migrations). Each downstream package that consumes DI bumps to its next major in the commit that migrates it.

---

## Phase 0 — Pre-flight cleanup (independent of v2 work)

Two tasks that are safe to do upfront because they don't touch the public DI surface.

### Task 0.1: Remove `bun-plugin.mts` Stage-3 transpilers

**Files to delete:**
- `bun-plugin.mts` (repo root)
- `packages/adapter-bun/bun-plugin.mts`
- `packages/otel-bun/bun-plugin.mts`
- `packages/adapter-xml/bun-plugin.mts`
- `examples/e2e-bun-stage3/bun-plugin.mts`
- `examples/openapi/bun-plugin.mts`
- `examples/simple-test/bun-plugin.mts`

**Files to modify (remove the `preload` entry that points at the deleted file):**
- `packages/adapter-bun/bunfig.toml`
- `packages/otel-bun/bunfig.toml` (check)
- `packages/adapter-xml/bunfig.toml` (check)
- `examples/e2e-bun-stage3/bunfig.toml`
- `examples/openapi/bunfig.toml`
- `examples/simple-test/bunfig.toml`

**Step 1:** Delete the seven `bun-plugin.mts` files.

**Step 2:** Edit each `bunfig.toml` to remove the `preload = ["./bun-plugin.mts"]` line (sometimes appears twice — once at top, once under `[test]`).

**Step 3:** From each Bun-running package, run `bun test` (or `bun run <a script>`) to confirm decorators still work natively.

Commands:
```bash
cd packages/adapter-bun && bun test
cd ../otel-bun && bun test
cd ../adapter-xml && bun test
cd ../../examples/e2e-bun-stage3 && bun run start --help  # or any entry that uses decorators
```
Expected: tests pass, scripts launch without "unexpected token @" or similar decorator errors.

**Step 4:** Commit.
```bash
git add -A
git commit -m "chore!: drop bun-plugin.mts stage-3 decorator transpilers (Bun native)"
```

---

### Task 0.2: Delete `legacy-compat/` directories everywhere

**Why now:** Hard cut for v2 means nothing imports them. Delete first so we don't accidentally migrate stale code.

**Files to delete (entire directories):**
- `packages/di/src/legacy-compat/`
- `packages/core/src/legacy-compat/`
- `packages/schedule/src/legacy-compat/`

**Files to modify:**
- `packages/di/package.json` — drop the `./legacy-compat` export entry from `exports`.
- `packages/di/tsdown.config.mts` — drop the `legacy-compat` entry (if listed).
- `packages/core/package.json`, `packages/core/tsdown.config.mts` — same.
- `packages/schedule/package.json`, `packages/schedule/tsdown.config.mts` — same.
- `packages/di/src/index.mts`, `packages/core/src/index.mts`, `packages/schedule/src/index.mts` — drop any `legacy-compat` re-exports.
- `examples/e2e-bun-legacy/` — **delete the entire directory**, it only existed for legacy decorators.

**Step 1:** `rg "legacy-compat" packages examples --files-with-matches` — review remaining references.

**Step 2:** Delete the four legacy-compat directories and `examples/e2e-bun-legacy/`.

**Step 3:** Update the three `package.json` files to remove `./legacy-compat` exports and any tsdown entry points.

**Step 4:** Update the three `index.mts` files to drop legacy re-exports (search inside each first to confirm).

**Step 5:** Run a build verify pass:
```bash
yarn turbo run build --filter=@navios/di --filter=@navios/core --filter=@navios/schedule
```
Expected: clean build.

**Step 6:** Run the full type-check:
```bash
yarn turbo run check
```
Expected: clean (downstream packages must not be importing `legacy-compat`).

**Step 7:** Commit.
```bash
git add -A
git commit -m "refactor!: remove legacy-compat directories from di/core/schedule"
```

---

## Phase 1 — Token unification + Standard Schema

Switch the schema validation type from `ZodObject | ZodRecord | ZodOptional<…>` to Standard Schema v1, and collapse the three token classes into one `Token` with `.bind()` / `.fromFactory()` methods.

### Task 1.1: Add Standard Schema as a peer dep, define the schema type

**Files:**
- Modify: `packages/di/package.json` (add `@standard-schema/spec` to dependencies)
- Create: `packages/di/src/token/schema.mts` — re-exports `StandardSchemaV1` type for internal use, plus a tiny `validateStandardSchema(schema, input): Result` helper.
- Test: `packages/di/src/__tests__/standard-schema.spec.mts`

**Step 1: Write the failing test.**

```ts
// packages/di/src/__tests__/standard-schema.spec.mts
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { validateStandardSchema } from '../token/schema.mjs'

describe('validateStandardSchema', () => {
  it('returns value on a valid input', async () => {
    const schema = z.object({ host: z.string(), port: z.number() })
    const result = await validateStandardSchema(schema, { host: 'a', port: 1 })
    expect(result).toEqual({ ok: true, value: { host: 'a', port: 1 } })
  })

  it('returns issues on an invalid input', async () => {
    const schema = z.object({ host: z.string() })
    const result = await validateStandardSchema(schema, { host: 42 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0)
    }
  })
})
```

**Step 2: Run to confirm failure.**
```bash
yarn turbo run test:ci --filter=@navios/di -- --run src/__tests__/standard-schema.spec.mts
```
Expected: FAIL — module not found.

**Step 3: Add the dep, write the helper.**

In `packages/di/package.json`, add to `dependencies`:
```json
  "dependencies": {
    "@standard-schema/spec": "^1.0.0"
  }
```
Then `yarn install`.

Create `packages/di/src/token/schema.mts`:
```ts
import type { StandardSchemaV1 } from '@standard-schema/spec'

export type { StandardSchemaV1 } from '@standard-schema/spec'

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: readonly StandardSchemaV1.Issue[] }

export async function validateStandardSchema<S extends StandardSchemaV1>(
  schema: S,
  input: unknown,
): Promise<ValidationResult<StandardSchemaV1.InferOutput<S>>> {
  const result = await schema['~standard'].validate(input)
  if ('issues' in result && result.issues) {
    return { ok: false, issues: result.issues }
  }
  return { ok: true, value: (result as { value: StandardSchemaV1.InferOutput<S> }).value }
}
```

**Step 4: Run, verify pass.**
```bash
yarn turbo run test:ci --filter=@navios/di -- --run src/__tests__/standard-schema.spec.mts
```
Expected: PASS.

**Step 5: Commit.**
```bash
git add packages/di/package.json packages/di/src/token/schema.mts packages/di/src/__tests__/standard-schema.spec.mts yarn.lock
git commit -m "feat(di): add standard-schema validation helper"
```

---

### Task 1.2: Rename `InjectionToken` to `Token`, switch schema type to Standard Schema

**Files:**
- Modify: `packages/di/src/token/injection-token.mts` → rename file to `token.mts`, rename class `InjectionToken` → `Token`. Replace `ZodObject | ZodRecord | …` schema constraints with `StandardSchemaV1`. Replace `z.input<S>` / `z.output<S>` with `StandardSchemaV1.InferInput<S>` / `…InferOutput<S>`.
- Modify: `packages/di/src/token/index.mts` — update re-exports.
- Modify: `packages/di/src/index.mts` — add `Token` to the public exports. **Keep `InjectionToken` as a deprecated re-export for one commit** so the rest of the package compiles; we'll delete it at the end of phase 1.
- Touch: every file in `packages/di/src/**` that imports `InjectionToken` to also import `Token` (we'll do the codemod-style rename in Task 1.5 once everything else is unified).

**Step 1: Write a failing test for the new class shape.**

`packages/di/src/__tests__/token-v2.spec.mts`:
```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { Token } from '../token/token.mjs'

describe('Token', () => {
  it('creates a plain token with no schema', () => {
    const tok = Token.create<string>('MyValue')
    expect(tok.name).toBe('MyValue')
    expect(tok.schema).toBeUndefined()
  })

  it('creates a token with a Standard Schema', () => {
    const schema = z.object({ id: z.string() })
    const tok = Token.create<{ id: string }, typeof schema>('Entity', schema)
    expect(tok.schema).toBe(schema)
  })
})
```

**Step 2: Run, expect "Token not found".**

**Step 3: Implement the rename.**

`packages/di/src/token/token.mts` — replace `injection-token.mts` content with `Token` renamed and schema constraints swapped to `StandardSchemaV1`. Preserve all behavior including `id`, `toString`, `generateTokenId`, `simpleHash`. Static methods stay: `create`, but defer `bound` / `factory` / `refineType` to subsequent tasks.

```ts
import type { StandardSchemaV1 } from './schema.mjs'

export type ClassType = new (...args: any[]) => any
// ...keep ClassType* helpers as in injection-token.mts...

function simpleHash(str: string): string { /* same */ }
function generateTokenId(name: string | symbol | ClassType, customId?: string): string { /* same */ }

export class Token<T, S extends StandardSchemaV1 | undefined = undefined> {
  public readonly id: string
  private formattedName: string | null = null

  constructor(
    public readonly name: string | symbol | ClassType,
    public readonly schema: S,
    customId?: string,
  ) {
    this.id = generateTokenId(name, customId)
  }

  static create<T extends ClassType>(name: T): Token<InstanceType<T>, undefined>
  static create<T extends ClassType, S extends StandardSchemaV1>(name: T, schema: S): Token<InstanceType<T>, S>
  static create<T>(name: string | symbol): Token<T, undefined>
  static create<T, S extends StandardSchemaV1>(name: string | symbol, schema: S): Token<T, S>
  static create(name: any, schema?: any, customId?: string) {
    return new Token(name, schema, customId)
  }

  toString() { /* same logic as v1 */ }
}
```

`packages/di/src/token/index.mts`:
```ts
export * from './token.mjs'
export * from './registry.mjs'
// keep injection-token re-export for one commit during the rename
export { Token as InjectionToken } from './token.mjs'
```

Delete `packages/di/src/token/injection-token.mts` — its replacement is `token.mts`.

**Step 4: Update import sites in `packages/di/src/**`** that reference `InjectionToken` from `./injection-token.mjs` to import from `./token.mjs`. List of likely sites (verify with `rg`):
- `packages/di/src/container/container.mts`
- `packages/di/src/container/scoped-container.mts`
- `packages/di/src/container/abstract-container.mts`
- `packages/di/src/decorators/injectable.decorator.mts`
- `packages/di/src/decorators/factory.decorator.mts`
- `packages/di/src/internal/core/*.mts`
- `packages/di/src/token/registry.mts`
- `packages/di/src/utils/get-injectable-token.mts`
- (run `rg "from.*injection-token" packages/di/src` to find all)

For now, `InjectionToken` and `Token` are aliases — leave the imports as `InjectionToken` so we don't churn the rest of the package yet. The `BoundInjectionToken` / `FactoryInjectionToken` classes are extracted next.

**Step 5: Run.**
```bash
yarn turbo run test:ci --filter=@navios/di -- --run src/__tests__/token-v2.spec.mts
yarn turbo run check --filter=@navios/di
```
Expected: new test PASSES, type-check clean (the rest of the test suite may fail on schema-type mismatches — that's fine, we fix in Task 1.5).

**Step 6: Commit.**
```bash
git add -A
git commit -m "refactor(di)!: rename InjectionToken to Token, switch to StandardSchema"
```

---

### Task 1.3: Collapse `BoundInjectionToken` / `FactoryInjectionToken` into `Token.bind()` / `Token.fromFactory()`

**Files:**
- Modify: `packages/di/src/token/token.mts` — add `bind()` and `fromFactory()` instance methods. Convert `BoundInjectionToken` and `FactoryInjectionToken` to internal subclasses named `BoundToken` and `FactoryToken`, exported only for the type system to narrow on (or fully internal).
- Modify: `packages/di/src/token/index.mts` — drop `BoundInjectionToken` / `FactoryInjectionToken` exports.
- Test: `packages/di/src/__tests__/token-v2.spec.mts` — extend with `.bind()` and `.fromFactory()` cases.

**Step 1: Extend the failing test.**

```ts
import type { FactoryContext } from '../internal/context/factory-context.mjs'

it('.bind(value) pre-binds args and produces a callable token', async () => {
  const schema = z.object({ port: z.number() })
  const tok = Token.create<{ port: number }, typeof schema>('Cfg', schema)
  const bound = tok.bind({ port: 5432 })
  expect(bound.value).toEqual({ port: 5432 })
  expect(bound.id).toBe(tok.id)
})

it('.fromFactory(fn) produces a lazy-resolving token', async () => {
  const schema = z.object({ port: z.number() })
  const tok = Token.create<{ port: number }, typeof schema>('Cfg', schema)
  const factoryFn = vi.fn(async () => ({ port: 9999 }))
  const factoryTok = tok.fromFactory(factoryFn)
  expect(factoryTok.resolved).toBe(false)
  await factoryTok.resolve({} as FactoryContext)
  expect(factoryTok.resolved).toBe(true)
  expect(factoryTok.value).toEqual({ port: 9999 })
})
```

**Step 2: Run, expect FAIL.**

**Step 3: Implement.**

In `token.mts`, after the `Token` class:
```ts
export class BoundToken<T, S extends StandardSchemaV1> {
  readonly id: string
  readonly name: string | symbol | ClassType
  readonly schema: S
  constructor(public readonly token: Token<T, S>, public readonly value: StandardSchemaV1.InferInput<S>) {
    this.id = token.id
    this.name = token.name
    this.schema = token.schema as S
  }
  toString() { return this.token.toString() }
}

export class FactoryToken<T, S extends StandardSchemaV1> {
  value?: StandardSchemaV1.InferInput<S>
  resolved = false
  readonly id: string
  readonly name: string | symbol | ClassType
  readonly schema: S
  constructor(
    public readonly token: Token<T, S>,
    public readonly factory: (ctx: FactoryContext) => Promise<StandardSchemaV1.InferInput<S>>,
  ) {
    this.id = token.id
    this.name = token.name
    this.schema = token.schema as S
  }
  async resolve(ctx: FactoryContext) {
    if (!this.resolved) {
      this.value = await this.factory(ctx)
      this.resolved = true
    }
    return this.value!
  }
  toString() { return this.token.toString() }
}
```

In `Token`, add methods that delegate:
```ts
bind(value: S extends StandardSchemaV1 ? StandardSchemaV1.InferInput<S> : never): BoundToken<T, S extends StandardSchemaV1 ? S : never> {
  return new BoundToken(this as any, value as any)
}

fromFactory(
  factory: (ctx: FactoryContext) => Promise<S extends StandardSchemaV1 ? StandardSchemaV1.InferInput<S> : never>,
): FactoryToken<T, S extends StandardSchemaV1 ? S : never> {
  return new FactoryToken(this as any, factory as any)
}
```

Keep `BoundInjectionToken` / `FactoryInjectionToken` as deprecated aliases via `export { BoundToken as BoundInjectionToken, FactoryToken as FactoryInjectionToken }` for one commit so consumers in the same PR can compile.

**Step 4: Run.**
```bash
yarn turbo run test:ci --filter=@navios/di -- --run src/__tests__/token-v2.spec.mts
```
Expected: PASS.

**Step 5: Commit.**
```bash
git commit -am "feat(di)!: add Token.bind() and Token.fromFactory(), deprecate BoundInjectionToken/FactoryInjectionToken aliases"
```

---

### Task 1.4: Update internal DI code to use `Token` / `BoundToken` / `FactoryToken`

**Goal:** Replace `InjectionToken` / `BoundInjectionToken` / `FactoryInjectionToken` references throughout `packages/di/src/**` with the new names. Inside the package only — consumers come later.

**Files:** every `*.mts` in `packages/di/src/` that references the old names. List via:
```bash
rg "InjectionToken|BoundInjectionToken|FactoryInjectionToken" packages/di/src --files-with-matches
```

**Step 1:** For each file in the list, rewrite:
- `InjectionToken` → `Token`
- `BoundInjectionToken` → `BoundToken`
- `FactoryInjectionToken` → `FactoryToken`
- Also update `import` statements (the imported names + the source path; if the file imports from `'../token/injection-token.mjs'` change to `'../token/token.mjs'`).

**Step 2:** Run the full DI test suite. Expected: existing tests still pass (we kept the deprecated aliases) and type-check is clean.
```bash
yarn turbo run test:ci --filter=@navios/di
yarn turbo run check --filter=@navios/di
```

**Step 3:** Commit.
```bash
git commit -am "refactor(di): use Token/BoundToken/FactoryToken internally"
```

---

### Task 1.5: Remove the deprecated aliases (`InjectionToken`, `BoundInjectionToken`, `FactoryInjectionToken`)

**Files:**
- Modify: `packages/di/src/token/token.mts` — delete the deprecated `export {}` aliases.
- Modify: `packages/di/src/token/index.mts` — drop `InjectionToken` re-export.
- Modify: `packages/di/src/index.mts` — remove the alias re-exports.

**Step 1:** Delete the three deprecated exports.

**Step 2:** Confirm nothing in `packages/di/src/**` still uses the old names:
```bash
rg "InjectionToken|BoundInjectionToken|FactoryInjectionToken" packages/di/src
```
Expected: no matches (except maybe in JSDoc comments — ignore those).

**Step 3:** Run check + tests for the DI package only. Consumers WILL break in `yarn turbo run check` for other packages — that's expected and gets fixed in Phase 8.
```bash
yarn turbo run test:ci --filter=@navios/di
yarn turbo run check --filter=@navios/di
```

**Step 4:** Commit.
```bash
git commit -am "refactor(di)!: remove InjectionToken/BoundInjectionToken/FactoryInjectionToken aliases"
```

---

## Phase 2 — Decorator metadata system + new `@Inject*` decorators

Build the field-decorator family **additively**. Old `inject()` / `asyncInject()` / `optional()` still exist after this phase — we delete them in Phase 3.

### Task 2.1: Add `InjectionMetadata` storage (WeakMap on class)

**Files:**
- Create: `packages/di/src/decorators/injection-metadata.mts` — defines `InjectionKind` (`Eager | Lazy | Optional | Derived`), `InjectionEntry` type, the `WeakMap<ClassType, InjectionEntry[]>`, and `registerInjection(target, entry)` / `getInjections(target): InjectionEntry[]` helpers.
- Test: `packages/di/src/__tests__/injection-metadata.spec.mts`

**Step 1: Write the failing test.**

```ts
import { describe, expect, it } from 'vitest'

import {
  getInjections,
  InjectionKind,
  registerInjection,
} from '../decorators/injection-metadata.mjs'
import { Token } from '../token/token.mjs'

describe('injection metadata', () => {
  it('stores and retrieves injections per class', () => {
    class A {}
    const tok = Token.create<string>('a')
    registerInjection(A, { kind: InjectionKind.Eager, fieldName: 'foo', token: tok })
    const entries = getInjections(A)
    expect(entries).toHaveLength(1)
    expect(entries[0].kind).toBe(InjectionKind.Eager)
    expect(entries[0].fieldName).toBe('foo')
    expect(entries[0].token).toBe(tok)
  })

  it('keeps entries isolated between classes', () => {
    class A {}
    class B {}
    const t = Token.create<string>('t')
    registerInjection(A, { kind: InjectionKind.Eager, fieldName: 'x', token: t })
    expect(getInjections(B)).toHaveLength(0)
  })
})
```

**Step 2: Run, expect FAIL (module not found).**

**Step 3: Implement.**

`packages/di/src/decorators/injection-metadata.mts`:
```ts
import type { Token, BoundToken, FactoryToken, ClassType } from '../token/token.mjs'

export enum InjectionKind {
  Eager = 'eager',
  Lazy = 'lazy',
  Optional = 'optional',
  Derived = 'derived',
}

type AnyToken = Token<any, any> | BoundToken<any, any> | FactoryToken<any, any>

export interface InjectionEntryEager {
  kind: InjectionKind.Eager
  fieldName: string | symbol
  token: AnyToken | ClassType
  args?: unknown
}
export interface InjectionEntryLazy {
  kind: InjectionKind.Lazy
  fieldName: string | symbol
  token: AnyToken | ClassType
  args?: unknown
}
export interface InjectionEntryOptional {
  kind: InjectionKind.Optional
  fieldName: string | symbol
  token: AnyToken | ClassType
  args?: unknown
}
export interface InjectionEntryDerived {
  kind: InjectionKind.Derived
  fieldName: string | symbol
  token: AnyToken | ClassType
  derive: (hostArgs: unknown) => unknown
}

export type InjectionEntry =
  | InjectionEntryEager
  | InjectionEntryLazy
  | InjectionEntryOptional
  | InjectionEntryDerived

const STORE = new WeakMap<ClassType, InjectionEntry[]>()

export function registerInjection(target: ClassType, entry: InjectionEntry): void {
  let list = STORE.get(target)
  if (!list) {
    list = []
    STORE.set(target, list)
  }
  list.push(entry)
}

export function getInjections(target: ClassType): readonly InjectionEntry[] {
  return STORE.get(target) ?? []
}
```

**Step 4: Run, verify PASS.**

**Step 5: Commit.**
```bash
git commit -am "feat(di): add injection metadata WeakMap and InjectionKind"
```

---

### Task 2.2: Implement `@Inject` (eager) decorator

**Files:**
- Create: `packages/di/src/decorators/inject.decorator.mts`
- Test: `packages/di/src/__tests__/inject-decorator.spec.mts` (metadata-only — actual resolution comes later)

**Step 1: Write the failing test.**

```ts
import { describe, expect, it } from 'vitest'

import { Inject } from '../decorators/inject.decorator.mjs'
import { getInjections, InjectionKind } from '../decorators/injection-metadata.mjs'
import { Token } from '../token/token.mjs'

describe('@Inject', () => {
  it('registers an eager injection on the class', () => {
    const Logger = Token.create<{}>('Logger')
    class Service {
      @Inject(Logger) accessor logger!: any
    }
    const entries = getInjections(Service)
    expect(entries).toHaveLength(1)
    expect(entries[0].kind).toBe(InjectionKind.Eager)
    expect(entries[0].token).toBe(Logger)
    expect(entries[0].fieldName).toBe('logger')
  })

  it('passes args through to the metadata entry', () => {
    const Sized = Token.create<{}>('Sized')
    class Service {
      @Inject(Sized, { size: 10 }) accessor val!: any
    }
    const entries = getInjections(Service)
    expect(entries[0]).toMatchObject({ args: { size: 10 } })
  })
})
```

**Step 2: Run, expect FAIL.**

**Step 3: Implement.**

`packages/di/src/decorators/inject.decorator.mts`:
```ts
import { InjectionKind, registerInjection } from './injection-metadata.mjs'

import type { BoundToken, ClassType, FactoryToken, Token } from '../token/token.mjs'

type AnyTokenOrClass = Token<any, any> | BoundToken<any, any> | FactoryToken<any, any> | ClassType

export function Inject<T>(token: AnyTokenOrClass, args?: unknown) {
  return (
    _target: ClassAccessorDecoratorTarget<unknown, T>,
    context: ClassAccessorDecoratorContext<unknown, T>,
  ): ClassAccessorDecoratorResult<unknown, T> | void => {
    if (context.kind !== 'accessor') {
      throw new Error('[DI] @Inject must be applied to an accessor field (`accessor foo!: Foo`).')
    }
    context.addInitializer(function (this: any) {
      registerInjection(this.constructor as ClassType, {
        kind: InjectionKind.Eager,
        fieldName: context.name,
        token,
        args,
      })
    })
    // Default accessor — value gets written by the resolver before construction completes
  }
}
```

> **Note** for the implementer: TS Stage-3 accessor decorators require the field to be declared with the `accessor` keyword (`accessor foo!: Foo`). This is the canonical Stage-3 idiom and what we'll use throughout. If the surrounding code uses TS field declarations without `accessor`, we MUST update them in the migration tasks.

**Step 4:** Run, verify PASS.

**Step 5: Commit.**
```bash
git commit -am "feat(di): add @Inject field decorator"
```

---

### Task 2.3: Implement `@InjectLazy`, `@InjectOptional`, `@InjectDerived`

**Files:**
- Create: `packages/di/src/decorators/inject-lazy.decorator.mts`
- Create: `packages/di/src/decorators/inject-optional.decorator.mts`
- Create: `packages/di/src/decorators/inject-derived.decorator.mts`
- Test: `packages/di/src/__tests__/inject-variants.spec.mts`

**Step 1: Write the failing test.**

```ts
import { describe, expect, it } from 'vitest'

import { InjectDerived } from '../decorators/inject-derived.decorator.mjs'
import { InjectLazy } from '../decorators/inject-lazy.decorator.mjs'
import { InjectOptional } from '../decorators/inject-optional.decorator.mjs'
import { getInjections, InjectionKind } from '../decorators/injection-metadata.mjs'
import { Token } from '../token/token.mjs'

describe('@Inject variants', () => {
  it('@InjectLazy registers a lazy entry', () => {
    const T = Token.create<{}>('T')
    class S { @InjectLazy(T) accessor t!: Promise<{}> }
    expect(getInjections(S)[0].kind).toBe(InjectionKind.Lazy)
  })

  it('@InjectOptional registers an optional entry', () => {
    const T = Token.create<{}>('T')
    class S { @InjectOptional(T) accessor t!: {} | null }
    expect(getInjections(S)[0].kind).toBe(InjectionKind.Optional)
  })

  it('@InjectDerived registers a derived entry with the callback stored', () => {
    const T = Token.create<{}>('T')
    const derive = (a: { x: number }) => ({ size: a.x })
    class S { @InjectDerived(T, derive) accessor t!: {} }
    const e = getInjections(S)[0]
    expect(e.kind).toBe(InjectionKind.Derived)
    if (e.kind === InjectionKind.Derived) expect(e.derive).toBe(derive)
  })
})
```

**Step 2:** Run, expect FAIL.

**Step 3:** Implement three near-identical files. Each is a copy of `inject.decorator.mts` with the `kind` swapped and (for derived) the second arg being a `derive` callback.

`inject-lazy.decorator.mts`:
```ts
import { InjectionKind, registerInjection } from './injection-metadata.mjs'
import type { /* ...same as Inject... */ } from '../token/token.mjs'

export function InjectLazy<T>(token: AnyTokenOrClass, args?: unknown) {
  return (_t: ClassAccessorDecoratorTarget<unknown, Promise<T>>, ctx: ClassAccessorDecoratorContext<unknown, Promise<T>>): void => {
    if (ctx.kind !== 'accessor') throw new Error('[DI] @InjectLazy must be on an accessor field.')
    ctx.addInitializer(function (this: any) {
      registerInjection(this.constructor, { kind: InjectionKind.Lazy, fieldName: ctx.name, token, args })
    })
  }
}
```

`inject-optional.decorator.mts` — same shape, `kind: Optional`, field type `T | null`.

`inject-derived.decorator.mts`:
```ts
export function InjectDerived<TDep, THostArgs>(
  token: AnyTokenOrClass,
  derive: (hostArgs: THostArgs) => unknown,
) {
  return (_t: ClassAccessorDecoratorTarget<unknown, TDep>, ctx: ClassAccessorDecoratorContext<unknown, TDep>): void => {
    if (ctx.kind !== 'accessor') throw new Error('[DI] @InjectDerived must be on an accessor field.')
    ctx.addInitializer(function (this: any) {
      registerInjection(this.constructor, {
        kind: InjectionKind.Derived,
        fieldName: ctx.name,
        token,
        derive: derive as (a: unknown) => unknown,
      })
    })
  }
}
```

**Step 4:** Run, verify PASS.

**Step 5: Commit.**
```bash
git commit -am "feat(di): add @InjectLazy, @InjectOptional, @InjectDerived decorators"
```

---

### Task 2.4: Re-export decorators from `packages/di/src/decorators/index.mts` and root `index.mts`

**Files:**
- Modify: `packages/di/src/decorators/index.mts` — add re-exports for the four new decorators and the metadata module.
- Modify: `packages/di/src/index.mts` — ensure decorators flow out (they already do via the wildcard, but be explicit).

**Step 1:** Edit `packages/di/src/decorators/index.mts` to add:
```ts
export * from './inject.decorator.mjs'
export * from './inject-lazy.decorator.mjs'
export * from './inject-optional.decorator.mjs'
export * from './inject-derived.decorator.mjs'
export * from './injection-metadata.mjs'
```

**Step 2:** Build verify.
```bash
yarn turbo run build --filter=@navios/di
```

**Step 3:** Commit.
```bash
git commit -am "feat(di): export new injection decorators from package root"
```

---

## Phase 3 — Resolver rewrite + delete old injection machinery

This is the breaking commit. Tests that exercised `inject()` / `asyncInject()` / `optional()` / `wrapSyncInit` get rewritten or deleted. Consumers stop compiling (we fix in Phase 8).

### Task 3.1: Rewrite `ServiceInitializer` to use injection metadata

**Files:**
- Modify: `packages/di/src/internal/core/service-initializer.mts` — replace its body with the new one-pass algorithm.
- Modify: `packages/di/src/container/container.mts` — drop the `injectors` constructor param.
- Modify: `packages/di/src/container/scoped-container.mts` — same.

**New algorithm:**

```ts
import { InjectableType } from '../../enums/index.mjs'
import { DIError } from '../../errors/index.mjs'
import { InjectionKind, getInjections } from '../../decorators/injection-metadata.mjs'

import type { FactoryRecord } from '../../token/registry.mjs'
import type { ServiceInitializationContext } from '../context/service-initialization-context.mjs'

export class ServiceInitializer {
  async instantiateService<T>(
    ctx: ServiceInitializationContext,
    record: FactoryRecord<T, any>,
    args: any = undefined,
  ): Promise<[undefined, T] | [DIError]> {
    try {
      switch (record.type) {
        case InjectableType.Class:
          return this.instantiateClass(ctx, record, args)
        case InjectableType.Factory:
          return this.instantiateFactory(ctx, record, args)
        default:
          throw DIError.unknown(`[ServiceInitializer] Unknown service type: ${record.type}`)
      }
    } catch (error) {
      return [error instanceof DIError ? error : DIError.initializationError(record.target.name, error as Error)]
    }
  }

  private async resolveInjections(
    ctx: ServiceInitializationContext,
    target: any,
    hostArgs: unknown,
  ): Promise<Map<string | symbol, unknown>> {
    const entries = getInjections(target)
    const resolved = new Map<string | symbol, unknown>()

    const eagerOrDerived = entries.filter(e => e.kind === InjectionKind.Eager || e.kind === InjectionKind.Derived)
    const eagerResults = await Promise.all(eagerOrDerived.map(async e => {
      const depArgs = e.kind === InjectionKind.Derived ? e.derive(hostArgs) : e.args
      const value = await ctx.inject(e.token as any, depArgs as any)
      return [e.fieldName, value] as const
    }))
    for (const [name, value] of eagerResults) resolved.set(name, value)

    for (const e of entries) {
      if (e.kind === InjectionKind.Lazy) {
        resolved.set(e.fieldName, ctx.inject(e.token as any, e.args as any))
      } else if (e.kind === InjectionKind.Optional) {
        resolved.set(
          e.fieldName,
          ctx.inject(e.token as any, e.args as any).catch(() => null),
        )
        // For Optional we await here to populate the field synchronously after deps resolve
      }
    }

    // Settle the optionals before construction
    for (const e of entries) {
      if (e.kind === InjectionKind.Optional) {
        resolved.set(e.fieldName, await (resolved.get(e.fieldName) as Promise<unknown>))
      }
    }

    return resolved
  }

  private async instantiateClass<T>(
    ctx: ServiceInitializationContext,
    record: FactoryRecord<T, any>,
    args: any,
  ): Promise<[undefined, T] | [DIError]> {
    const resolved = await this.resolveInjections(ctx, record.target, args)
    const instance = new record.target(...(args !== undefined ? [args] : [])) as any
    for (const [field, value] of resolved) {
      instance[field] = value
    }
    if ('onServiceInit' in instance) await (instance as any).onServiceInit()
    if ('onServiceDestroy' in instance) ctx.addDestroyListener(async () => (instance as any).onServiceDestroy())
    return [undefined, instance]
  }

  private async instantiateFactory<T>(
    ctx: ServiceInitializationContext,
    record: FactoryRecord<T, any>,
    args: any,
  ): Promise<[undefined, T] | [DIError]> {
    const resolved = await this.resolveInjections(ctx, record.target, args)
    const builder = new record.target() as any
    for (const [field, value] of resolved) builder[field] = value
    if (typeof builder.create !== 'function') {
      throw DIError.initializationError(record.target.name, new Error('Factory does not implement create()'))
    }
    const instance = await builder.create(ctx, args)
    return [undefined, instance]
  }
}
```

Drop the `injectors` constructor parameter from `Container` and `ScopedContainer`. Drop the import of `defaultInjectors` from `container.mts`.

**Step 1:** Apply the rewrite.

**Step 2:** Run the DI test suite. Expected: many failures in tests that used `inject()` / `asyncInject()` / `optional()`. We fix these in Tasks 3.3+. The "Container basic functionality" tests should still pass.
```bash
yarn turbo run test:ci --filter=@navios/di
```

**Step 3: Commit (breaking).**
```bash
git commit -am "refactor(di)!: rewrite ServiceInitializer for one-pass metadata-driven resolution"
```

---

### Task 3.2: Delete `get-injectors`, `default-injectors`, the throw-proxy

**Files:**
- Delete: `packages/di/src/utils/get-injectors.mts`
- Delete: `packages/di/src/utils/default-injectors.mts`
- Modify: `packages/di/src/utils/index.mts` — drop exports.
- Modify: `packages/di/src/index.mts` — confirm no `inject` / `asyncInject` / `optional` / `wrapSyncInit` / `provideFactoryContext` is exported.

**Step 1:** Delete the two files.

**Step 2:** Update `utils/index.mts`:
```ts
export * from './get-injectable-token.mjs'
export * from './types.mjs'
```
Remove the `getInjectors` and `defaultInjectors` exports if listed elsewhere.

**Step 3:** Update `index.mts`. Should now have no `inject` / `asyncInject` / `optional` exports (they came via `defaultInjectors`).

**Step 4:** Build verify — package will likely fail to type-check because some internal files still import these. Fix by replacing them with `getInjections`-driven code or delete the call sites.
```bash
yarn turbo run check --filter=@navios/di
```
Iterate until clean.

**Step 5:** Run tests. Old tests that import `inject` / `asyncInject` etc. will fail to compile. Mark them for deletion or rewrite in Task 3.3.
```bash
yarn turbo run test:ci --filter=@navios/di
```

**Step 6: Commit.**
```bash
git commit -am "refactor(di)!: delete inject()/asyncInject()/optional() and frozen-replay machinery"
```

---

### Task 3.3: Rewrite the DI test suite to use field decorators

**Files** — every spec file in `packages/di/src/__tests__/` that uses `inject` / `asyncInject` / `optional`:
- `container.spec.mts`
- `concurrent.spec.mts`
- `e2e.spec.mts`
- `e2e.browser.spec.mts`
- `get-injectors.spec.mts` — **delete** (the function no longer exists)
- `gc/*.spec.mts`
- `injection-token.spec.mts`
- `library-findings.spec.mts`
- `resolution-context.spec.mts`
- `scope-tracker.spec.mts` — **delete** (component removed in Phase 5)
- `scope-upgrade.spec.mts` — **delete** (upgrades removed in Phase 5)
- `scoped-container.spec.mts`
- `test-container.spec.mts`
- `unified-storage.spec.mts`
- `unit-test-container.spec.mts`

**Step 1:** For each file, do the migration shown in the design doc's migration map:
- `inject(Foo)` → `@Inject(Foo) accessor foo!: Foo`
- `asyncInject(Foo)` → `@InjectLazy(Foo) accessor foo!: Promise<Foo>` (and `await this.foo` at use sites)
- `optional(Foo)` → `@InjectOptional(Foo) accessor foo!: Foo | null`

**Step 2:** Delete the two scope-tracker / scope-upgrade tests and the get-injectors test.

**Step 3:** Run.
```bash
yarn turbo run test:ci --filter=@navios/di
yarn turbo run check --filter=@navios/di
```
Iterate until green.

**Step 4: Commit.**
```bash
git commit -am "test(di)!: migrate test suite to field-decorator injection"
```

---

### Task 3.4: Update type tests

**Files:** every `*.spec-d.mts` in `packages/di/src/__type-tests__/`:
- `container.spec-d.mts`
- `factory.spec-d.mts`
- `inject.spec-d.mts`
- `injectable.spec-d.mts`
- `injection-token.spec-d.mts` → rename to `token.spec-d.mts`
- `scoped-container.spec-d.mts`

**Step 1:** Rewrite each to assert types of the new API:
- `Container.get(MyClass)` returns `Promise<MyClass>`.
- `Token.create<T>(...)` returns `Token<T, undefined>`.
- `tok.bind(...)` returns `BoundToken<T, S>`.
- `tok.fromFactory(...)` returns `FactoryToken<T, S>`.
- `@Inject` requires `accessor` keyword.
- The "args required" string-literal error type stays — it's a nice DX.

**Step 2:** Run.
```bash
yarn turbo run test:ci --filter=@navios/di
```

**Step 3: Commit.**
```bash
git commit -am "test(di)!: update type tests for v2 API"
```

---

## Phase 4 — Plugin system

### Task 4.1: Define `Plugin` interface + `PluginRegistry`

**Files:**
- Create: `packages/di/src/plugin/plugin.mts` — types: `Plugin`, `CreateContext`, `DestroyContext`. The `definePlugin` helper.
- Create: `packages/di/src/plugin/plugin-registry.mts` — holds plugins, composes middleware, dispatches hooks.
- Create: `packages/di/src/plugin/index.mts` — re-exports.
- Test: `packages/di/src/__tests__/plugin-registry.spec.mts`

**Step 1: Write failing tests covering:**
- Registering a plugin via `register()` makes it observable via `getAll()`.
- `runMiddleware(ctx, core)` composes plugins outer-to-inner (Koa-style).
- `runBeforeCreate` / `runAfterCreate` / etc. call hooks in registration order, awaited.
- A plugin without a particular hook is skipped without error.

**Step 2:** Run, expect FAIL.

**Step 3:** Implement. `PluginRegistry`'s middleware composer is the standard Koa fold:
```ts
async runMiddleware(ctx: CreateContext, core: () => Promise<unknown>): Promise<unknown> {
  const mws = this.plugins.filter(p => p.middleware).map(p => p.middleware!.bind(p))
  let i = -1
  const dispatch = (idx: number): Promise<unknown> => {
    if (idx <= i) throw new Error('next() called multiple times')
    i = idx
    const fn = idx < mws.length ? mws[idx] : null
    if (!fn) return core()
    return fn(ctx, () => dispatch(idx + 1))
  }
  return dispatch(0)
}
```

**Step 4:** Run, verify PASS.

**Step 5: Commit.**
```bash
git commit -am "feat(di): add Plugin interface and PluginRegistry"
```

---

### Task 4.2: Wire `PluginRegistry` into `Container` and `InstanceResolver`

**Files:**
- Modify: `packages/di/src/container/container.mts` — accept `plugins` in constructor options object (replace the positional `registry, logger, injectors` signature with an options bag — breaking change, but acceptable).
- Modify: `packages/di/src/internal/core/instance-resolver.mts` — call `runBeforeCreate`, wrap `serviceInitializer.instantiateService` in `runMiddleware`, call `runAfterCreate`.
- Modify: `packages/di/src/internal/core/service-invalidator.mts` — call `runBeforeDestroy` / `runAfterDestroy`.

**Step 1: Write integration test.**

`packages/di/src/__tests__/plugin-integration.spec.mts`:
```ts
import { describe, expect, it } from 'vitest'

import { Container, Injectable, definePlugin } from '../index.mjs'

describe('plugins wired into container', () => {
  it('runs onAfterCreate hooks', async () => {
    const seen: string[] = []
    @Injectable() class A {}
    const container = new Container({
      plugins: [definePlugin({
        name: 'logger',
        onAfterCreate: (ctx) => { seen.push(ctx.target.name) },
      })],
    })
    await container.get(A)
    expect(seen).toContain('A')
  })

  it('middleware wraps the instance', async () => {
    @Injectable() class A { value = 1 }
    const container = new Container({
      plugins: [definePlugin({
        name: 'wrap',
        async middleware(ctx, next) {
          const inst = (await next()) as A
          inst.value = 99
          return inst
        },
      })],
    })
    const a = await container.get(A)
    expect(a.value).toBe(99)
  })
})
```

**Step 2:** Run, expect FAIL (constructor signature change + missing wiring).

**Step 3:** Implement. The `Container` constructor signature becomes:
```ts
export interface ContainerOptions {
  registry?: Registry
  logger?: Console
  plugins?: Plugin[]
}
constructor(options: ContainerOptions = {}) {
  this.registry = options.registry ?? globalRegistry
  this.logger = options.logger ?? null
  this.plugins = new PluginRegistry(options.plugins ?? [])
  // ...
}
```

Add `Container.use(plugin: Plugin): void` to attach plugins after construction.

In `InstanceResolver.createAndStoreInstance` (the path that creates new instances), wrap the call to `serviceInitializer.instantiateService` in `plugins.runMiddleware(ctx, () => …)`. Hook `runBeforeCreate` immediately before, `runAfterCreate` after the holder is stored.

**Step 4:** Run, verify PASS. Update existing tests that pass positional args to `new Container(registry, logger)` — they need `new Container({ registry, logger })`.

**Step 5: Commit.**
```bash
git commit -am "feat(di)!: wire PluginRegistry into Container + InstanceResolver"
```

---

## Phase 5 — Scope simplification

### Task 5.1: Delete `ScopeTracker` + scope-upgrade plumbing

**Files:**
- Delete: `packages/di/src/internal/core/scope-tracker.mts`
- Modify: `packages/di/src/internal/core/instance-resolver.mts` — drop all `scopeTracker.checkAndUpgradeScope(...)` calls and the upgrade branches in `createServiceInitializationContext`.
- Modify: `packages/di/src/internal/holder/unified-storage.mts` — drop `updateDependencyReference()` if it's only used by ScopeTracker.
- Modify: `packages/di/src/internal/core/name-resolver.mts` — drop `upgradeInstanceNameToRequest()` if it's only used by ScopeTracker.
- Modify: `packages/di/src/token/registry.mts` — drop `updateScope()`.
- Modify: `packages/di/src/container/container.mts` — drop the `scopeTracker` field and constructor wiring.

**Step 1:** Delete the file + all the upgrade plumbing. Run the type-check, follow the errors, simplify.

**Step 2:** Run.
```bash
yarn turbo run check --filter=@navios/di
yarn turbo run test:ci --filter=@navios/di
```
Expected: clean (scope-upgrade tests were deleted in Task 3.3).

**Step 3: Commit.**
```bash
git commit -am "refactor(di)!: delete ScopeTracker and runtime scope upgrades"
```

---

### Task 5.2: Add scope compatibility check at first resolution

**Files:**
- Create: `packages/di/src/internal/core/scope-validator.mts` — `validateScopeCompatibility(target, registry): void | throws DIError`.
- Modify: `packages/di/src/internal/core/service-initializer.mts` — call the validator once per class (memoized via WeakMap).
- Modify: `packages/di/src/errors/di-error.mts` — add `scopeMismatch` factory if not present, with actionable message.

**Step 1: Write failing test.**

```ts
import { describe, expect, it } from 'vitest'
import { Container, Inject, Injectable, InjectableScope, Registry } from '../index.mjs'

describe('scope compatibility', () => {
  it('throws when a Singleton eagerly injects a Request-scoped dep', async () => {
    const registry = new Registry()
    @Injectable({ registry, scope: InjectableScope.Request })
    class Req {}
    @Injectable({ registry })
    class Sing {
      @Inject(Req) accessor req!: Req
    }
    const container = new Container({ registry })
    await expect(container.get(Sing)).rejects.toThrow(/Sing is Singleton but depends on Req \(Request\)/)
  })

  it('does NOT throw with @InjectLazy', async () => {
    const registry = new Registry()
    @Injectable({ registry, scope: InjectableScope.Request })
    class Req {}
    @Injectable({ registry })
    class Sing {
      @InjectLazy(Req) accessor req!: Promise<Req>
    }
    const container = new Container({ registry })
    // Resolves up to construction, then Sing.req is a Promise that errors when awaited from non-request context
    await expect(container.get(Sing)).resolves.toBeInstanceOf(Sing)
  })
})
```

**Step 2:** Run, expect FAIL.

**Step 3:** Implement.

`packages/di/src/internal/core/scope-validator.mts`:
```ts
import { InjectableScope } from '../../enums/index.mjs'
import { InjectionKind, getInjections } from '../../decorators/injection-metadata.mjs'
import { DIError } from '../../errors/index.mjs'

import type { Registry } from '../../token/registry.mjs'
import type { ClassType } from '../../token/token.mjs'

const VALIDATED = new WeakMap<ClassType, true>()

export function validateScopeCompatibility(target: ClassType, hostScope: InjectableScope, registry: Registry, tokenResolver: TokenResolver): void {
  if (VALIDATED.has(target)) return
  VALIDATED.set(target, true)
  for (const entry of getInjections(target)) {
    if (entry.kind === InjectionKind.Lazy || entry.kind === InjectionKind.Optional) continue
    const realToken = tokenResolver.getRegistryToken(entry.token)
    if (!registry.has(realToken)) continue
    const depScope = registry.get(realToken).scope
    if (hostScope === InjectableScope.Singleton && depScope === InjectableScope.Request) {
      throw DIError.scopeMismatch(target.name, realToken.name.toString(), 'Singleton', 'Request')
    }
    if (hostScope === InjectableScope.Singleton && depScope === InjectableScope.Transient) {
      throw DIError.scopeMismatch(target.name, realToken.name.toString(), 'Singleton', 'Transient')
    }
  }
}
```

Wire into `ServiceInitializer.instantiateClass` and `instantiateFactory` — call immediately before resolving injections.

Add `DIError.scopeMismatch(host, dep, hostScope, depScope)` with the actionable message format.

**Step 4:** Run, verify PASS.

**Step 5: Commit.**
```bash
git commit -am "feat(di)!: validate scope compatibility once per class, throw clear error"
```

---

## Phase 6 — Slim Container API

### Task 6.1: Move internal getters to `container.internals` namespace

**Files:**
- Modify: `packages/di/src/container/container.mts` — collect the 8 internal components behind a single `readonly internals` getter that returns a frozen object. Remove the top-level `getStorage()` / `getServiceInitializer()` / etc.
- Modify: `packages/di/src/container/scoped-container.mts` — same treatment for `getStorage()` (the only one it currently exposes).
- Modify: `packages/di/src/interfaces/container.interface.mts` — drop the methods from `IContainer`.

**Public on Container:** `get`, `invalidate`, `dispose`, `clear` (if exists), `isRegistered`, `calculateInstanceName`, `beginRequest`, `getActiveRequestIds`, `hasActiveRequest`, `removeRequestId`, `use`, `ready`. Plus `internals`.

**Public on ScopedContainer:** `get`, `invalidate`, `endRequest`, `dispose`, `ready`, `isRegistered`, `calculateInstanceName`, `getMetadata`, `setMetadata`, `getRequestId`, `getParent`. Plus `internals` (just `storage` here).

**Step 1: Write the failing test.**

```ts
describe('container.internals', () => {
  it('exposes registry, storage, eventBus, resolver, etc. behind `internals`', () => {
    const c = new Container()
    expect(c.internals).toBeDefined()
    expect(c.internals.registry).toBeDefined()
    expect(c.internals.storage).toBeDefined()
    expect(c.internals.eventBus).toBeDefined()
    expect(c.internals.resolver).toBeDefined()
    expect(c.internals.serviceInitializer).toBeDefined()
    expect(c.internals.serviceInvalidator).toBeDefined()
    expect(c.internals.tokenResolver).toBeDefined()
    expect(c.internals.nameResolver).toBeDefined()
  })

  it('removes top-level component getters', () => {
    const c = new Container()
    expect((c as any).getStorage).toBeUndefined()
    expect((c as any).getServiceInitializer).toBeUndefined()
  })
})
```

**Step 2:** Run, expect FAIL.

**Step 3:** Implement. Construct `this.internals = Object.freeze({ registry, storage, eventBus, resolver, serviceInitializer, serviceInvalidator, tokenResolver, nameResolver })` and remove the eight `get*()` methods.

Update internal callers (`InstanceResolver`, `ScopedContainer`, `ServiceInvalidator`, the React `useService` hook, OTEL plugin) to use `container.internals.X` — but wait until Phase 8 for downstream consumers. Just keep internal-package usage working.

**Step 4:** Run.
```bash
yarn turbo run test:ci --filter=@navios/di
yarn turbo run check --filter=@navios/di
```

**Step 5: Commit.**
```bash
git commit -am "refactor(di)!: move 8 internal getters behind container.internals"
```

---

### Task 6.2: Update testing utilities for v2

**Files:**
- Modify: `packages/di/src/testing/test-container.mts` — add `mockInject(target, fieldName, value)` helper. Update `bind().toClass()` etc. to work with field-decorator metadata.
- Modify: `packages/di/src/testing/unit-test-container.mts` — flip `enableAutoMocking()` to be the default; add a `{ strict: true }` option to opt back.
- Modify: their tests.

**Step 1: Write failing tests for the new behavior.**

```ts
// test-container.spec.mts
it('mockInject sets a field on a service instance', async () => {
  @Injectable({ registry })
  class S {
    @Inject(SomeDep) accessor dep!: SomeDep
  }
  const tc = new TestContainer({ registry })
  tc.mockInject(S, 'dep', { stub: true })
  const inst = await tc.get(S)
  expect(inst.dep).toEqual({ stub: true })
})

// unit-test-container.spec.mts
it('auto-mocks unregistered deps by default', async () => {
  const utc = new UnitTestContainer({ providers: [] })
  const inst = await utc.get(SomeUnregistered)
  expect(inst).toBeDefined()
})

it('strict:true mode throws on unregistered deps', async () => {
  const utc = new UnitTestContainer({ providers: [], strict: true })
  await expect(utc.get(SomeUnregistered)).rejects.toThrow(DIError)
})
```

**Step 2:** Run, expect FAIL.

**Step 3:** Implement.

**Step 4:** Verify, run full DI test suite.

**Step 5: Commit.**
```bash
git commit -am "feat(di)!: TestContainer.mockInject + UnitTestContainer auto-mocking default"
```

---

### Task 6.3: Bump `@navios/di` to 2.0.0

**Files:**
- Modify: `packages/di/package.json` — `"version": "2.0.0"`.
- Modify: `packages/di/CHANGELOG.md` — prepend a `## 2.0.0` entry with the breaking-changes summary (copy from the design doc).

**Step 1:** Edit both files.

**Step 2:** Final DI-package verification:
```bash
yarn turbo run build --filter=@navios/di
yarn turbo run test:ci --filter=@navios/di
yarn turbo run check --filter=@navios/di
yarn turbo run lint --filter=@navios/di
```

**Step 3: Commit.**
```bash
git commit -am "chore(di)!: bump @navios/di to 2.0.0"
```

---

## Phase 7 — `@navios/di-react` migration

### Task 7.1: Rewrite `useService` for v2 sound `tryGetSync`

**Files:**
- Modify: `packages/di-react/src/hooks/use-service.mts` — the sync-try / async-fallback dance compresses. No more throw-proxy means `tryGetSync` is unambiguous: instance or null.
- Modify: every hook in `packages/di-react/src/hooks/` to use `container.internals.eventBus` instead of `container.getEventBus()`.
- Modify: tests under `packages/di-react/src/hooks/__tests__/`.

**Step 1:** Adjust hook tests to use field-decorator services in fixtures.

**Step 2:** Rewrite `useService` as documented in the design doc (target ~80 LOC).

**Step 3:** Verify.
```bash
yarn turbo run test:ci --filter=@navios/di-react
yarn turbo run check --filter=@navios/di-react
```

**Step 4: Commit.**
```bash
git commit -am "refactor(di-react)!: rewrite useService for v2 sound tryGetSync"
```

---

### Task 7.2: Bump `@navios/di-react` to 2.0.0

Same as Task 6.3 but for `@navios/di-react`.

---

## Phase 8 — Migrate downstream packages

Each downstream package gets one task. The mechanical transform per package:

1. Replace `inject(X)` → `@Inject(X) accessor x!: X` (add `accessor` keyword!).
2. Replace `asyncInject(X)` → `@InjectLazy(X) accessor x!: Promise<X>`.
3. Replace `optional(X)` → `@InjectOptional(X) accessor x!: X | null`.
4. Replace `inject(X, ctorArgs.foo)` → `@InjectDerived(X, (a) => a.foo) accessor x!: X`.
5. Replace `InjectionToken` → `Token`.
6. Replace `InjectionToken.bound(t, v)` → `t.bind(v)`.
7. Replace `InjectionToken.factory(t, fn)` → `t.fromFactory(fn)`.
8. Replace `container.getStorage()` etc. → `container.internals.storage`.
9. Update `new Container(reg, logger)` → `new Container({ registry: reg, logger })`.
10. Bump that package's major version.
11. Run the package's tests + check + lint.
12. Commit per package.

### Task 8.1: Migrate `@navios/core`

**Files** — every file in `packages/core/src/**` that imports from `@navios/di` (run `rg "from '@navios/di'" packages/core/src --files-with-matches`).

**Step 1:** Apply the 10-step migration to each file. Pay special attention to args-dependent inject calls (those become `@InjectDerived`).

**Step 2:** Update `packages/core/src/__tests__/**` fixtures to use field decorators.

**Step 3:** Update OTEL pre-resolve plugin call sites if `core` integrates with it.

**Step 4:** `packages/core/package.json` — bump version to next major; update `@navios/di` peer/dep to `^2.0.0`.

**Step 5:** Verify.
```bash
yarn turbo run build --filter=@navios/core
yarn turbo run test:ci --filter=@navios/core
yarn turbo run check --filter=@navios/core
yarn turbo run lint --filter=@navios/core
```

**Step 6: Commit.**
```bash
git commit -am "refactor(core)!: migrate to @navios/di v2 field-decorator injection"
```

---

### Task 8.2: Migrate `@navios/otel` — collapse OTEL into a single middleware plugin

**Files:**
- `packages/otel/src/plugins/otel-tracing.plugin.mts` — rewrite to use the new `definePlugin({ middleware })` form per the design doc.
- `packages/otel/src/factories/traced-wrapper.factory.mts` — **delete** (no longer needed).
- `packages/otel/src/factories/index.mts` — drop the export.
- `packages/otel/src/services/**` — apply standard migration (field decorators).
- `packages/otel/src/index.mts` — drop `createTracedWrapperFactory` export.
- `packages/otel/src/__tests__/**` — update.

**Step 1:** Replace `defineOtelTracingPlugin` body with the new middleware-based version (~10 LOC per design doc).

**Step 2:** Delete `createTracedWrapperFactory` file.

**Step 3:** Migrate the OTEL services (field decorators).

**Step 4:** Run.
```bash
yarn turbo run build --filter=@navios/otel
yarn turbo run test:ci --filter=@navios/otel
yarn turbo run check --filter=@navios/otel
```

**Step 5: Commit.**
```bash
git commit -am "refactor(otel)!: collapse tracing into single middleware plugin, drop wrapper factory"
```

---

### Task 8.3: Migrate `@navios/otel-bun`

Same shape as 8.2 but smaller. Run, verify, commit.

```bash
git commit -am "refactor(otel-bun)!: migrate to @navios/di v2"
```

---

### Task 8.4: Migrate `@navios/otel-fastify`

Same shape.

```bash
git commit -am "refactor(otel-fastify)!: migrate to @navios/di v2"
```

---

### Task 8.5: Migrate `@navios/jwt`

Apply the 10-step transform across `packages/jwt/src/**`. Bump version, verify, commit.

```bash
git commit -am "refactor(jwt)!: migrate to @navios/di v2"
```

---

### Task 8.6: Migrate `@navios/microservice`

Apply the 10-step transform. Bump version, verify, commit.

```bash
git commit -am "refactor(microservice)!: migrate to @navios/di v2"
```

---

### Task 8.7: Migrate `@navios/schedule`

Apply the 10-step transform (note: `legacy-compat` already deleted in Phase 0). Bump version, verify, commit.

```bash
git commit -am "refactor(schedule)!: migrate to @navios/di v2"
```

---

### Task 8.8: Migrate `@navios/adapter-bun`, `@navios/adapter-fastify`, `@navios/adapter-xml`

Three tasks merged here since adapters tend to be thin. One commit per package.

---

### Task 8.9: Migrate `@navios/openapi`, `openapi-bun`, `openapi-fastify`, `@navios/builder`, `@navios/cli`, `@navios/commander`, `@navios/navios`, `@navios/queues`, `@navios/react-query`

Audit each. Some may not import from `@navios/di` at all — verify with `rg "from '@navios/di'" packages/<pkg>/src`. Skip those. For ones that do, apply transform, bump, verify, commit.

---

### Task 8.10: Migrate examples

**Files:** every `examples/<dir>/src/**/*.mts`.

For each example:
1. Apply the 10-step transform.
2. Run the example's start command (`bun run start` or `node --import tsx ./src/main.mts` etc.) — verify it boots.
3. Commit per example.

```bash
git commit -am "refactor(examples)!: migrate to @navios/di v2"
```
(Can be one big commit since examples don't ship as packages.)

---

## Phase 9 — Final cleanup, docs, codemod (optional)

### Task 9.1: Update `packages/di/README.md`

Rewrite the README to match the v2 API (field decorators, plugins, Token). Move v1 docs to `docs/migration-v1-to-v2.md` if you want to preserve them; otherwise drop.

```bash
git commit -am "docs(di): rewrite README for v2 API"
```

### Task 9.2: Update `packages/di-react/README.md`

Same treatment, smaller scope.

### Task 9.3: Update apps/docs site

Files under `apps/docs/docs/di/**` — update tutorials, code samples, decorator pages.

### Task 9.4: Optional — write a jscodeshift codemod

If consumer migration uncovered repetitive patterns, write `tools/codemods/di-v1-to-v2.cjs` to automate the 10-step transform. Run it on any future user reports.

### Task 9.5: Final monorepo verification

```bash
yarn install
yarn turbo run build
yarn turbo run test:ci
yarn turbo run check
yarn turbo run lint
```
All green.

```bash
git commit -am "chore: final monorepo green-build verification for di v2"
```

### Task 9.6: Open the PR

```bash
git push -u origin claude/relaxed-bhaskara-977c6f
gh pr create --base next --title "feat(di)!: v2 overhaul — field-decorator injection, plugin system" --body "$(cat <<'EOF'
## Summary
- Field-decorator injection (`@Inject` / `@InjectLazy` / `@InjectOptional` / `@InjectDerived`) replaces `inject()` / `asyncInject()` / `optional()`.
- One-pass resolver: no frozen-replay double-construct, no throw-proxy.
- Plugin system with both lifecycle hooks and Koa-style middleware (OTEL collapses to ~10 LOC).
- Standard Schema replaces hard-baked Zod v4.
- Unified `Token` class with `.bind()` / `.fromFactory()` methods.
- 8 internal Container getters move behind `container.internals`.
- Runtime scope-upgrade machinery deleted (~215 LOC); replaced by once-per-class compatibility check.
- Stage-3 decorator transpilation `bun-plugin.mts` files removed — Bun has native support.
- `legacy-compat/` directories removed.
- Every downstream package and example migrated.

Full design: `docs/plans/2026-05-15-di-v2-overhaul-design.md`
Implementation plan: `docs/plans/2026-05-15-di-v2-overhaul-plan.md`

## Test plan
- [ ] `yarn turbo run build` green
- [ ] `yarn turbo run test:ci` green
- [ ] `yarn turbo run check` green
- [ ] `yarn turbo run lint` clean
- [ ] OTEL example boots and emits spans for `@Traced` services
- [ ] Bun examples boot without `bun-plugin.mts`
- [ ] React example renders `useService` without sync-try crashes
- [ ] Manual smoke test: `@InjectDerived` resolves dep args from constructor args

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Risk register

| Risk | Mitigation |
|---|---|
| Stage-3 accessor decorators behave differently in Bun vs tsc vs Vitest | Run Bun + Vitest test suites in CI; smoke each example. |
| `@InjectDerived`'s `derive` callback receiving wrong type when host class has no schema | Validate at decorator-time when `Injectable({ schema })` is absent — throw "InjectDerived requires the host class to have a schema". |
| Plugins that call `container.get` inside middleware → infinite loop | Add a re-entrancy guard in `PluginRegistry.runMiddleware` and document. |
| Bun native decorators emit slightly different metadata than tsc | Test on both runtimes in CI. The accessor-decorator init pattern in Task 2.2 should be identical across runtimes. |
| Consumer migration misses a call site | The codemod in Task 9.4 + a `rg "\\binject\\(|asyncInject\\(|optional\\(" packages examples` sweep at the end of Phase 8 catches stragglers. |

---

## Definition of done

- All 9 phases committed.
- Single PR open against `next` with the title above.
- Green CI across build / test / check / lint.
- README + docs updated.
- No `inject(`, `asyncInject(`, `optional(`, `wrapSyncInit(`, `provideFactoryContext(`, `InjectionToken`, `BoundInjectionToken`, `FactoryInjectionToken`, `ScopeTracker`, `legacy-compat`, or `bun-plugin.mts` references in `rg` across `packages/` and `examples/`.
