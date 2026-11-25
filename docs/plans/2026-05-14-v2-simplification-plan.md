# Navios v2 Simplification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Land the architectural simplifications from the v2 design doc on top of envelope mode, removing ~825 net lines and reducing the cost of adding new endpoint fields from ~6 files to ≤2.

**Architecture:** This branch (`feat/v2-simplification`) is based on `feat/builder-response-envelope` and targets `next` (the v2 integration branch). Envelope mode behavior must be preserved end-to-end; legacy `useDiscriminatorResponse` / `__status` injection / dual-signature helpers / parallel type hierarchies are deleted outright (no back-compat shims — this is v2). The result is one canonical endpoint type pair (`EndpointOptions` / `EndpointHandler<Options>`), client configs that derive from `EndpointOptions` instead of redeclaring fields, one error hook, and a decomposed `createHandler`.

**Tech Stack:** TypeScript 5+, Zod v4, Vitest (`*.spec.mts`, `*.spec-d.mts`), TanStack Query v5, Yarn + Turbo.

**Design doc:** [`docs/plans/2026-05-14-architecture-simplification-design.md`](./2026-05-14-architecture-simplification-design.md). Every task here implements a numbered section of §3.

**Conventions** (from `CLAUDE.md`):
- `yarn`, not `npm`. `yarn turbo run <script> --filter=<package>` for per-package.
- `.mts` source, `*.spec.mts` unit tests, `*.spec-d.mts` type tests.
- No semicolons, single quotes, Oxlint.
- Frequent commits — each task ends with a commit.

**Branch state:** `feat/v2-simplification` is already created locally from `feat/builder-response-envelope`. Push when ready: `git push -u origin feat/v2-simplification`. Open PR against `next` once envelope PR #55 merges (or open it now as a draft).

**Invariant for every task:** all 785 tests from PR #55 (envelope mode) must continue to pass except where we are deliberately deleting their target. When deletions remove a test target, delete the test in the same commit and account for it explicitly.

---

## Task 1: Pre-flight inventory

**Goal:** Verify the state of the branch and produce a baseline test count before any deletions, so we can detect unexpected losses.

**Files:** none (read-only).

**Step 1: Confirm starting state**

```bash
git log --oneline next..HEAD | wc -l  # expect 24 (envelope) + 1 (design doc) = 25
git branch --show-current              # expect feat/v2-simplification
```

**Step 2: Snapshot test counts**

```bash
yarn turbo run test:ci --filter=@navios/builder --filter=@navios/react-query 2>&1 | grep -E "Tests +[0-9]+ passed"
```

Expected baseline: `@navios/builder` 539, `@navios/react-query` 246, total 785.

**Step 3: Inventory `UseDiscriminator` usage**

```bash
grep -rn "UseDiscriminator" packages/builder/src packages/react-query/src --include='*.mts' | wc -l
```

Record the count (expect ~50-60 lines). After Task 5 it should be 0.

**Step 4: Inventory `useDiscriminatorResponse` usage**

```bash
grep -rn "useDiscriminatorResponse" packages/builder packages/react-query --include='*.mts' --include='*.md' | wc -l
```

Record the count. After Tasks 2-4 it should be 0 in `.mts` files (README / CHANGELOG may keep historical references).

**Step 5: Note the count baseline in a working scratch file**

(Optional — no commit. Just write down the numbers somewhere you can refer to.)

---

## Task 2: Drop `UseDiscriminator` generic from builder types

**Goal:** Remove the `UseDiscriminator extends boolean` generic from every builder type. Envelope mode supersedes its purpose.

**Files:**
- Modify: `packages/builder/src/types/builder-instance.mts`
- Modify: `packages/builder/src/types/config.mts` (the `BuilderContext` interface uses it)
- Modify: `packages/builder/src/builder.mts` (the factory)
- Modify: `packages/builder/src/handlers/*.mts` (handler factories accept `BuilderContext`)
- Modify: `packages/builder/src/types/__type-tests__/builder-instance.spec-d.mts`

**Step 1: Read the current shape**

```bash
grep -n "UseDiscriminator" packages/builder/src/types/builder-instance.mts
grep -n "UseDiscriminator" packages/builder/src/types/config.mts
grep -n "UseDiscriminator" packages/builder/src/builder.mts
```

**Step 2: Update `EndpointHandler` and `StreamHandler`**

In `packages/builder/src/types/builder-instance.mts`:

```ts
// Before
export type EndpointHandler<Options extends EndpointOptions, UseDiscriminator extends boolean> = ((
  params: InferEndpointParams<Options>,
) => Promise<InferEndpointReturn<Options, UseDiscriminator>>) & {
  config: Options
}

// After
export type EndpointHandler<Options extends EndpointOptions> = ((
  params: InferEndpointParams<Options>,
) => Promise<InferEndpointReturn<Options>>) & {
  config: Options
}
```

Do the same for `StreamHandler<Options>`.

**Step 3: Update `InferEndpointReturn` and `InferStreamReturn`**

```ts
// Before
export type InferEndpointReturn<
  Options extends EndpointOptions,
  UseDiscriminator extends boolean,
> = Options extends { result: 'envelope' }
  ? ResponseEnvelope<...>
  : UseDiscriminator extends true
    ? Options['errorSchema'] extends ErrorSchemaRecord
      ? z.output<Options['responseSchema']> | InferErrorSchemaOutputWithStatus<Options['errorSchema']>
      : z.output<Options['responseSchema']>
    : z.output<Options['responseSchema']>

// After
export type InferEndpointReturn<Options extends EndpointOptions> =
  Options extends { result: 'envelope' }
    ? ResponseEnvelope<
        z.output<Options['responseSchema']>,
        EnvelopeError<Options['errorSchema'] extends ErrorSchemaRecord ? Options['errorSchema'] : undefined>
      >
    : z.output<Options['responseSchema']>
```

Mirror for `InferStreamReturn`.

**Step 4: Update `BuilderInstance`**

```ts
// Before
export interface BuilderInstance<UseDiscriminator extends boolean = false> {
  declareEndpoint<const Options extends EndpointOptions>(
    options: Options,
  ): EndpointHandler<Options, UseDiscriminator>
  // ...
}

// After
export interface BuilderInstance {
  declareEndpoint<const Options extends EndpointOptions>(
    options: Options,
  ): EndpointHandler<Options>
  // ...
}
```

**Step 5: Update `BuilderContext`**

In `packages/builder/src/types/config.mts`:

```ts
// Before
export interface BuilderContext<UseDiscriminator extends boolean = boolean> {
  getClient: () => Client
  config: BuilderConfig<UseDiscriminator>
}

// After
export interface BuilderContext {
  getClient: () => Client
  config: BuilderConfig
}
```

Also drop the `<UseDiscriminator extends boolean = false>` from `BuilderConfig` itself.

**Step 6: Update `builder()` factory**

In `packages/builder/src/builder.mts`, drop the generic:

```ts
// Before
export function builder<UseDiscriminator extends boolean = false>(
  config: BuilderConfig<UseDiscriminator> = ...
): BuilderInstance<UseDiscriminator>

// After
export function builder(config: BuilderConfig = {}): BuilderInstance
```

Drop the deprecation-warning latch for `useDiscriminatorResponse` — Task 3 deletes the field entirely.

**Step 7: Update handler factories**

`createEndpoint`, `createMultipart`, `createStream` accept `BuilderContext` without the generic. Update each (small, mechanical).

**Step 8: Update the type test files**

`packages/builder/src/types/__type-tests__/builder-instance.spec-d.mts` (102 tests) — every `EndpointHandler<X, true>` or `<X, false>` becomes `EndpointHandler<X>`. Same for `StreamHandler`, `InferEndpointReturn`, `InferStreamReturn`.

Use a careful sed (verify with grep first):

```bash
grep -n "EndpointHandler<.*, " packages/builder/src/types/__type-tests__/builder-instance.spec-d.mts | head
```

Manually update or use `find … -exec sed` with careful patterns.

**Step 9: Verify**

```bash
yarn turbo run test:ci --filter=@navios/builder
yarn turbo run lint --filter=@navios/builder
```

Expect: still 539 tests, no type errors, lint clean.

**Step 10: Commit**

```bash
git add packages/builder/src/types/builder-instance.mts packages/builder/src/types/config.mts packages/builder/src/builder.mts packages/builder/src/handlers/ packages/builder/src/types/__type-tests__/builder-instance.spec-d.mts
git commit -m "refactor(builder)!: drop UseDiscriminator generic from public types"
```

The `!` in the commit type signals a breaking change in conventional-commits terms.

---

## Task 3: Delete `useDiscriminatorResponse` runtime behavior

**Goal:** Remove the `useDiscriminatorResponse` field and its branch in `handleError`. The envelope path is the only error-handling mode going forward in the data branch; legacy data mode now strictly throws.

**Files:**
- Modify: `packages/builder/src/types/config.mts` (drop the field from `BuilderConfig`)
- Modify: `packages/builder/src/errors/handle-error.mts` (drop the discriminator branch)
- Modify: `packages/builder/src/builder.mts` (remove the deprecation-warning machinery if not already removed in Task 2)
- Delete: tests that exclusively covered `useDiscriminatorResponse`:
  - `packages/builder/src/__tests__/discriminator-mode.spec.mts` (if it exists — check)
  - The three `deprecation warning for useDiscriminatorResponse` tests in `packages/builder/src/__tests__/builder.spec.mts`

**Step 1: Find tests exercising the flag**

```bash
grep -rln "useDiscriminatorResponse" packages/builder/src/__tests__
```

Inspect each file. Tests that use it as setup but don't assert on its specific behavior → leave the file but remove the flag usage. Tests that are dedicated to the flag → delete the file or `describe` block.

**Step 2: Remove the field from `BuilderConfig`**

In `packages/builder/src/types/config.mts`, delete the `useDiscriminatorResponse?:` field and its JSDoc block.

**Step 3: Simplify `handleError`**

In `packages/builder/src/errors/handle-error.mts`, the legacy branch is:

```ts
if (!config.useDiscriminatorResponse) {
  if (config.onZodError && error instanceof ZodError) {
    config.onZodError(error, undefined, undefined)
  }
  throw error
}
// ... discriminator parse-via-responseSchema or errorSchema branches ...
```

Simplify to:

```ts
export function handleError(
  config: BuilderConfig,
  error: unknown,
): never {
  if (config.onError) {
    config.onError(error)  // Task 10 will refine this to BuilderErrorEvent
  }
  if (config.onZodError && error instanceof ZodError) {
    config.onZodError(error, undefined, undefined)
  }
  throw error
}
```

(Note: `errorSchema` is still useful for envelope mode via `classifyError`. The data-mode path stops caring about it — if the user wants discriminated errors, they use `result: 'envelope'`.)

Drop the unused `responseSchema` / `errorSchema` parameters from `handleError`. Update the one call site in `create-handler.mts` (legacy data branch) to drop them.

**Step 4: Delete the deprecation alias**

In the same file:

```ts
// Delete this:
export const handleException = handleError
```

**Step 5: Delete `UnknownResponseError`** — only used by the removed discriminator branch. File: `packages/builder/src/errors/unknown-response-error.mts`. Delete the file and remove its export from `packages/builder/src/errors/index.mts`.

**Step 6: Update tests**

Delete:
- The `describe('deprecation warning for useDiscriminatorResponse', ...)` block in `packages/builder/src/__tests__/builder.spec.mts`.
- Any test file dedicated to discriminator-mode runtime behavior.

Update:
- Tests that incidentally set `useDiscriminatorResponse: true` as setup — remove the flag; if the assertion depended on its behavior, either delete the test or convert it to envelope mode.

**Step 7: Verify**

```bash
yarn turbo run test:ci --filter=@navios/builder
yarn turbo run lint --filter=@navios/builder
```

Expect: a smaller test count (10-30 fewer tests depending on what was dedicated to the flag). No failures.

**Step 8: Commit**

```bash
git add packages/builder/
git commit -m "refactor(builder)!: remove useDiscriminatorResponse and legacy error branch"
```

---

## Task 4: Delete `__status` injection and legacy error guards

**Goal:** Remove the legacy guards (`isErrorStatus`, `isErrorResponse`), the `InferErrorSchemaOutputWithStatus` type, and any remaining `__status`-injection code. Replaced by envelope mode's typed `EnvelopeError`.

**Files:**
- Modify: `packages/builder/src/types/error-schema.mts` (delete the guards and the WithStatus type)
- Modify: `packages/builder/src/types/index.mts` (if necessary)
- Modify: any consumer code or tests using these guards

**Step 1: Find consumers**

```bash
grep -rn "isErrorStatus\|isErrorResponse\|InferErrorSchemaOutputWithStatus\|__status" \
  packages/builder/src packages/react-query/src --include='*.mts'
```

After Tasks 2-3, the only callers should be tests. Delete or update.

**Step 2: Delete the legacy guards and types**

In `packages/builder/src/types/error-schema.mts`, delete:
- `InferErrorSchemaOutputWithStatus`
- `isErrorStatus`
- `isErrorResponse`

Keep: `ErrorSchemaRecord`, `InferErrorSchemaOutput` (the version without `__status` injection — still useful for envelope `EnvelopeError`).

**Step 3: Update any remaining test usage**

Tests that exercise `isErrorStatus` / `isErrorResponse` — replace with the envelope equivalents (`isHttpError(error, 404)` etc.) OR delete if redundant.

**Step 4: Verify & commit**

```bash
yarn turbo run test:ci --filter=@navios/builder
yarn turbo run lint --filter=@navios/builder
git add packages/builder/
git commit -m "refactor(builder)!: remove isErrorStatus / isErrorResponse / __status injection"
```

---

## Task 5: Drop `UseDiscriminator` from react-query types

**Goal:** Mirror Task 2 on the react-query side. The generic existed only to thread through the builder's flag; now it's vestigial.

**Files:**
- Modify: `packages/react-query/src/common/types.mts` (`IsEnvelope`)
- Modify: `packages/react-query/src/client/types/helpers.mts` (`ComputeBaseResult`, `ComputeQueryResult`, `ComputeInfinitePageResult`, `EndpointHelper`, `StreamHelper`)
- Modify: `packages/react-query/src/client/types/query.mts` (`ClientQueryMethods<UseDiscriminator>`)
- Modify: `packages/react-query/src/client/types/infinite-query.mts` (`ClientInfiniteQueryMethods<UseDiscriminator>`)
- Modify: `packages/react-query/src/client/types/mutation.mts` (`ClientMutationMethods<UseDiscriminator>`)
- Modify: `packages/react-query/src/client/types/multipart-mutation.mts`
- Modify: `packages/react-query/src/client/types/from-endpoint.mts` (`ClientFromEndpointMethods<UseDiscriminator>`)
- Modify: `packages/react-query/src/client/declare-client.mts` (the `declareClient<UseDiscriminator>` factory)
- Modify: `packages/react-query/src/query/make-options.mts`, `make-infinite-options.mts`, `mutation/make-hook.mts` — drop any `UseDiscriminator` generic.
- Modify: type tests under `packages/react-query/src/client/__type-tests__/`

**Step 1: grep**

```bash
grep -rln "UseDiscriminator" packages/react-query/src --include='*.mts'
```

**Step 2: Remove generic from `IsEnvelope`**

```ts
// Before
export type IsEnvelope<E> = E extends EndpointHandler<infer O, boolean>
  ? O extends { result: 'envelope' } ? true : false
  : false

// After
export type IsEnvelope<E> = E extends EndpointHandler<infer O>
  ? O extends { result: 'envelope' } ? true : false
  : false
```

**Step 3: Remove generic from result computers** (will be redone in Task 6)

For now, replace `UseDiscriminator extends boolean` with deletion, and drop the `UseDiscriminator extends true ? ... : ...` branches. After Task 6 these computers collapse to one.

**Step 4: Remove generic from `declareClient`**

```ts
// Before
export function declareClient<UseDiscriminator extends boolean = false>({
  api,
  defaults,
}: ClientOptions<UseDiscriminator>): ClientInstance<UseDiscriminator>

// After
export function declareClient({ api, defaults }: ClientOptions): ClientInstance
```

**Step 5: Mechanical sweep**

Remove the `<UseDiscriminator>` parameter from every interface, type, and method signature that still has it. Each removal cascades — work top-down from `declareClient` outward.

**Step 6: Verify**

```bash
yarn turbo run test:ci --filter=@navios/react-query
yarn turbo run lint --filter=@navios/react-query
```

Lots of type tests touched; expect noisy output. Resolve until clean.

**Step 7: Commit**

```bash
git add packages/react-query/
git commit -m "refactor(react-query)!: drop UseDiscriminator generic"
```

---

## Task 6: Unify result-type computers

**Goal:** Collapse `ComputeBaseResult`, `ComputeQueryResult`, `ComputeInfinitePageResult` into one `ComputeResult<Options, Unwrap>`. Per design §3.4.

**Files:**
- Modify: `packages/react-query/src/client/types/helpers.mts`
- Modify: every caller (already touched in Task 5)

**Step 1: Define the new computer**

In `packages/react-query/src/client/types/helpers.mts`:

```ts
import type { EndpointOptions, InferEndpointReturn, ResponseEnvelope, EnvelopeError } from '@navios/builder'
import type { z, ZodType } from 'zod/v4'

import type { InfiniteUnwrapMode, UnwrapMode } from '../../query/types.mjs'

/**
 * Compute the public data-channel type for an endpoint, taking unwrap mode into account.
 *
 * - Envelope endpoint + unwrap: 'none' (default) → `ResponseEnvelope<...>` (the full envelope)
 * - Envelope endpoint + unwrap: 'throw-on-error' or 'pages' → unwrapped body
 * - Non-envelope endpoint → `z.output<responseSchema>` (existing behaviour)
 */
export type ComputeResult<
  Options extends EndpointOptions,
  Unwrap extends UnwrapMode | InfiniteUnwrapMode = 'none',
> = Options extends { result: 'envelope' }
  ? Unwrap extends 'throw-on-error' | 'pages'
    ? z.output<Options['responseSchema']>
    : InferEndpointReturn<Options>
  : z.output<Options['responseSchema']>
```

**Step 2: Delete the three legacy computers**

Delete from `helpers.mts`:
- `ComputeBaseResult`
- `ComputeQueryResult`
- `ComputeInfinitePageResult`
- `ResultMode` (no longer needed at the helper level — it lives on `Options['result']`)
- The deprecated `ResponseDataType` alias

**Step 3: Update callers**

`query.mts`, `infinite-query.mts`, `mutation.mts`, `multipart-mutation.mts`, `from-endpoint.mts` — replace references with `ComputeResult<Options, Unwrap>`. After this, the per-surface configs in Task 7 will derive `Options` first and pass it in.

**Step 4: Verify & commit**

```bash
yarn turbo run test:ci --filter=@navios/react-query
yarn turbo run lint --filter=@navios/react-query
git add packages/react-query/src/client/types/helpers.mts packages/react-query/src/client/types/*.mts
git commit -m "refactor(react-query)!: unify result-type computers into one ComputeResult"
```

---

## Task 7: Refactor client configs to derive from `EndpointOptions`

**Goal:** The headline change. Each per-surface config interface stops re-declaring `EndpointOptions` fields and instead `extends Options`.

**Files:**
- Modify: `packages/react-query/src/client/types/query.mts`
- Modify: `packages/react-query/src/client/types/infinite-query.mts`
- Modify: `packages/react-query/src/client/types/mutation.mts`
- Modify: `packages/react-query/src/client/types/multipart-mutation.mts`
- Modify: `packages/react-query/src/client/types/from-endpoint.mts`
- Modify: `packages/react-query/src/client/declare-client.mts` (implementation may need small fixes — likely none, since runtime already pulled fields from a single config object)

**Step 1: Refactor `QueryEndpointConfig`**

```ts
// Before — 11 generics
interface QueryEndpointConfig<
  Method, Url, QuerySchema, RequestSchema, ResponseSchema,
  ErrorSchema, UrlParamsSchema, ResultModeT, Unwrap, TBaseResult, Result,
> extends EndpointOptions { ... 10 field redeclarations ... }

// After — 3 generics
export interface QueryEndpointConfig<
  Options extends EndpointOptions,
  Unwrap extends UnwrapMode = 'none',
  Result = ComputeResult<Options, Unwrap>,
> extends Options {
  processResponse?: (data: ComputeResult<Options, Unwrap>) => Result
  unwrap?: Unwrap
}
```

**Step 2: Collapse the `query` method signature**

```ts
// Before — 11+ generics, BuildEndpointOptions helper
query<const Method, ..., const Result>(config: QueryEndpointConfig<Method, ..., Result>): ...

// After — 2-3 generics
query<
  const Options extends EndpointOptions,
  const Unwrap extends UnwrapMode = 'none',
  const Result = ComputeResult<Options, Unwrap>,
>(
  config: QueryEndpointConfig<Options, Unwrap, Result>,
): ((params: Simplify<InferEndpointParams<Options>>) => UseSuspenseQueryOptions<
  Result, Error, Result, DataTag<Split<Options['url'], '/'>, Result, Error>
>) & QueryHelpers<Options, Result> & EndpointHelper<Options>
```

Note: `QueryHelpers` may also need a small refactor to accept `Options` instead of individual schema generics. Check its signature in `packages/react-query/src/query/types.mts` and consolidate where reasonable. If the refactor balloons, leave `QueryHelpers` for a follow-up and adapt the args.

**Step 3: Delete `BuildEndpointOptions`**

The helper at the top of `query.mts`:

```ts
type BuildEndpointOptions<Method, Url, QuerySchema, RequestSchema, ResponseSchema, ErrorSchema, UrlParamsSchema> = { ... }
```

is no longer needed — `Options` is inferred directly from the config. Delete.

**Step 4: Repeat for the other surfaces**

`InfiniteQueryEndpointConfig` collapses the same way:

```ts
export interface InfiniteQueryEndpointConfig<
  Options extends EndpointOptions & { querySchema: ZodObject },
  Unwrap extends InfiniteUnwrapMode = 'none',
  PageResult = ComputeResult<Options, Unwrap>,
> extends Options {
  processResponse?: (data: ComputeResult<Options, Unwrap>) => PageResult
  unwrap?: Unwrap
  getNextPageParam: (lastPage: PageResult, ...) => ...
  getPreviousPageParam?: (...) => ...
}
```

`MutationEndpointConfig` collapses from 15 generics:

```ts
export interface MutationEndpointConfig<
  Options extends EndpointOptions,
  Unwrap extends UnwrapMode = 'none',
  Result = ComputeResult<Options, Unwrap>,
  OnMutateResult = unknown,
  Context = unknown,
  UseKey extends boolean = false,
> extends Options {
  processResponse?: (data: ComputeResult<Options, Unwrap>) => Result | Promise<Result>
  unwrap?: Unwrap
  useContext?: () => Context
  useKey?: UseKey
  onMutate?: (variables: Variables<Options>, context: Context & MutationFunctionContext) => OnMutateResult | Promise<OnMutateResult>
  onSuccess?: (data: NoInfer<Result>, variables: Variables<Options>, context: ...) => void | Promise<void>
  onError?: (error: Error, variables: Variables<Options>, context: ...) => void | Promise<void>
  onSettled?: (data: NoInfer<Result> | undefined, error: Error | null, variables: Variables<Options>, context: ...) => void | Promise<void>
}

type Variables<Options extends EndpointOptions> = Simplify<RequestArgs<
  Options['url'],
  Options['querySchema'] extends ZodObject ? Options['querySchema'] : undefined,
  Options['requestSchema'] extends ZodType ? Options['requestSchema'] : undefined,
  Options['urlParamsSchema'] extends ZodObject ? Options['urlParamsSchema'] : undefined
>>
```

Multipart variants follow the same pattern.

**Step 5: Update `from-endpoint.mts`**

The `xxxFromEndpoint` methods already take `endpoint: { config: Options }` and derive types from `Options`. They should already work — verify no regressions.

**Step 6: Verify**

```bash
yarn turbo run test:ci --filter=@navios/react-query
yarn turbo run lint --filter=@navios/react-query
```

Type-test churn will be significant. Many `*.spec-d.mts` assertions reference the old generic shapes; some will fail not because the behavior changed but because the generic signature did. Update test files to use the new shape (`config = { ...options, processResponse: ..., unwrap: ... }`).

**Step 7: Commit**

```bash
git add packages/react-query/src/client/
git commit -m "refactor(react-query)!: client configs derive from EndpointOptions instead of redeclaring"
```

---

## Task 8: Delete legacy type hierarchies

**Goal:** With the configs derived from `Options`, the legacy parallel hierarchies can go.

**Files:**
- Modify: `packages/builder/src/types/config.mts` — delete `BaseEndpointConfig`, `BaseStreamConfig`, `AnyEndpointConfig`, `AnyStreamConfig`, `StreamOptions` alias
- Modify: `packages/builder/src/types/index.mts` — drop exports if applicable
- Modify: `packages/react-query/src/client/types/helpers.mts` — delete `EndpointHelper`'s legacy 4-5-arg pattern branch, delete `StreamHelper`'s legacy branch, delete `ClientEndpointHelper` deprecated alias
- Modify: `packages/react-query/src/query/types.mts` — drop `AbstractEndpoint<Config>` type (now everything uses `EndpointHandler<Options>`)
- Modify: `packages/react-query/src/query/make-infinite-options.mts` — already widened in Task 17 of PR #55; verify it now uses just `EndpointHandler<Options>` directly without the legacy union

**Step 1: Inventory**

```bash
grep -rn "BaseEndpointConfig\|BaseStreamConfig\|AnyEndpointConfig\|AnyStreamConfig\|AbstractEndpoint\|ClientEndpointHelper" \
  packages/builder/src packages/react-query/src --include='*.mts'
```

Every match is either a definition (delete) or a remaining consumer (update to use `EndpointOptions` / `EndpointHandler`).

**Step 2: Delete legacy `config.mts` types**

In `packages/builder/src/types/config.mts`, delete the four `@deprecated` interfaces and the `StreamOptions` alias.

**Step 3: Delete dual signatures**

In `packages/react-query/src/client/types/helpers.mts`, `EndpointHelper` currently has two patterns ("new" and "legacy 4-5 args"). Keep only the new:

```ts
export type EndpointHelper<Options extends EndpointOptions> = {
  endpoint: EndpointHandler<Options>
}
```

Same for `StreamHelper`. Delete `ClientEndpointHelper` outright.

**Step 4: Delete `AbstractEndpoint`**

In `packages/react-query/src/query/types.mts`, remove the `AbstractEndpoint<Config>` type. All callers should now use `EndpointHandler<Options>`.

**Step 5: Verify**

```bash
yarn turbo run test:ci --filter=@navios/builder --filter=@navios/react-query
yarn turbo run lint --filter=@navios/builder --filter=@navios/react-query
```

If a deletion turns up an unexpected consumer (e.g. a socket / SSE file uses one of the legacy types), update it to the modern shape.

**Step 6: Commit**

```bash
git add packages/builder/ packages/react-query/
git commit -m "refactor!: delete legacy type hierarchies (BaseEndpointConfig, AbstractEndpoint, dual helper signatures)"
```

---

## Task 9: Decompose `createHandler`

**Goal:** Split the 120-line `createHandler` into composable pieces per design §3.6.

**Files:**
- Modify: `packages/builder/src/handlers/create-handler.mts`
- Add tests: `packages/builder/src/handlers/__tests__/composers.spec.mts` (new — direct tests for the small composers)

**Step 1: Write tests first**

Create `packages/builder/src/handlers/__tests__/composers.spec.mts`:

```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { buildOk, buildErr, runRequest } from '../create-handler.mjs'
import { isHttpError, isNetworkError } from '../../errors/guards.mjs'

import type { Client } from '../../types/common.mjs'

describe('runRequest', () => {
  it('returns ok with response on success', async () => {
    const client: Client = {
      request: () => Promise.resolve({ data: { x: 1 }, status: 200, statusText: 'OK', headers: new Headers() }),
    }
    const result = await runRequest(client, { method: 'GET', url: '/u' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.response.data).toEqual({ x: 1 })
  })

  it('returns err on rejection', async () => {
    const client: Client = { request: () => Promise.reject(new TypeError('boom')) }
    const result = await runRequest(client, { method: 'GET', url: '/u' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBeInstanceOf(TypeError)
  })
})

describe('buildOk / buildErr', () => {
  it('buildOk creates a frozen ok envelope', () => {
    const env = buildOk({ x: 1 }, { status: 200, statusText: 'OK', headers: new Headers() })
    expect(env.ok).toBe(true)
    expect(env.data).toEqual({ x: 1 })
    expect(env.error).toBeNull()
  })

  it('buildErr classifies and wraps', () => {
    const env = buildErr(new TypeError('net'), undefined)
    expect(env.ok).toBe(false)
    if (!env.ok) expect(isNetworkError(env.error)).toBe(true)
  })

  it('buildErr with errorSchema produces http variant', () => {
    const error = {
      response: { data: { msg: 'gone' }, status: 404, statusText: 'NF', headers: new Headers() },
    }
    const env = buildErr(error, { 404: z.object({ msg: z.string() }) })
    expect(env.ok).toBe(false)
    if (!env.ok) expect(isHttpError(env.error, 404)).toBe(true)
  })
})
```

**Step 2: Refactor `create-handler.mts`**

```ts
import type { Client, AbstractResponse, AbstractRequestConfig } from '../types/common.mjs'
import type { ResponseEnvelope, ResponseEnvelopeOk, ResponseEnvelopeErr, ResponseMeta } from '../types/envelope.mjs'
import type { EnvelopeError } from '../types/envelope-error.mjs'
import type { ErrorSchemaRecord } from '../types/error-schema.mjs'
import { classifyError } from '../errors/classify-error.mjs'

export type RunResult =
  | { ok: true; response: AbstractResponse<unknown> }
  | { ok: false; error: unknown }

export async function runRequest(client: Client, config: AbstractRequestConfig): Promise<RunResult> {
  try {
    const response = await client.request(config)
    return { ok: true, response }
  } catch (error) {
    return { ok: false, error }
  }
}

export function toResponseMeta(
  r: { status: number; statusText: string; headers: Headers | Record<string, string> },
): ResponseMeta {
  const headers = r.headers instanceof Headers ? r.headers : new Headers(r.headers)
  return { status: r.status, statusText: r.statusText, headers }
}

export function buildOk<TData>(data: TData, response: ResponseMeta | AbstractResponse<unknown>): ResponseEnvelopeOk<TData> {
  return { ok: true, data, error: null, response: 'headers' in response && response.headers instanceof Headers ? response as ResponseMeta : toResponseMeta(response) }
}

export function buildErr(error: unknown, errorSchema: ErrorSchemaRecord | undefined): ResponseEnvelopeErr<EnvelopeError> {
  const envError = classifyError(error, errorSchema)
  const resp = (error as { response?: AbstractResponse<unknown> }).response
  return { ok: false, data: null, error: envError, response: resp ? toResponseMeta(resp) : null }
}
```

Then `runEnvelope` and `runData` become small composers — each ~30 lines. The exported `createHandler` becomes the selector:

```ts
export function createHandler<Options extends EndpointOptions | StreamOptions, TResponse>(
  opts: CreateHandlerOptions<Options>,
): EndpointHandler<Options>['call'] {
  const resultMode = opts.options.result ?? opts.context.config.defaults?.result ?? 'data'
  return resultMode === 'envelope' ? runEnvelope(opts) : runData(opts)
}
```

**Step 3: Verify the existing 7-test envelope spec still passes**

```bash
yarn turbo run test:ci --filter=@navios/builder
```

The composer tests are new (~6 tests). Envelope spec (8 tests) and existing handler tests must remain green.

**Step 4: Commit**

```bash
git add packages/builder/src/handlers/
git commit -m "refactor(builder): decompose createHandler into runEnvelope / runData / runRequest / buildOk / buildErr"
```

---

## Task 10: One `onError` hook with `BuilderErrorEvent`

**Goal:** Replace `onError(error: unknown)`, `onZodError(error, response, originalError)`, and `onFail(err)` with one structured-event hook.

**Files:**
- Modify: `packages/builder/src/types/config.mts` — define `BuilderErrorEvent`; replace `onError` / `onZodError` with the new shape.
- Modify: `packages/builder/src/errors/handle-error.mts` and `classify-error.mts` — fire the new event.
- Modify: `packages/builder/src/handlers/create-handler.mts` — fire the new event in the envelope branches.
- Modify: `packages/react-query/src/query/make-options.mts`, `make-infinite-options.mts`, `mutation/make-hook.mts` — drop `onFail`. The builder's `onError` is the single hook.
- Modify: `packages/react-query/src/client/types/query.mts`, `infinite-query.mts`, `mutation.mts`, `multipart-mutation.mts`, `from-endpoint.mts` — drop `onFail` from each surface.
- Add tests: `packages/builder/src/__tests__/on-error.spec.mts`

**Step 1: Define the event**

In `packages/builder/src/types/config.mts`:

```ts
import type { $ZodIssue } from 'zod/v4/core'
import type { EnvelopeError } from './envelope-error.mjs'

export interface BuilderErrorEvent {
  /** The error variant classification. Matches `EnvelopeError['kind']`. */
  kind: EnvelopeError['kind']

  /** HTTP method and URL of the endpoint that produced the error. */
  endpoint: {
    method: HttpMethod
    url: string
  }

  /** HTTP status code, when available (absent for `kind: 'network'`). */
  status?: number

  /** Zod validation issues, present when `kind === 'validation'`. */
  zodIssues?: readonly $ZodIssue[]

  /** Original thrown value (e.g. NaviosError, TypeError, AbortError). */
  cause: unknown

  /** Response body for HTTP errors (raw if `http-unknown`, parsed if `http`). */
  body?: unknown
}

export interface BuilderConfig {
  defaults?: { result?: 'data' | 'envelope' }
  /**
   * Called whenever any error path fires — HTTP error, Zod validation failure,
   * or network failure. In envelope mode, errors are not thrown but this hook
   * still fires for telemetry. In data mode, this fires before the error is
   * rethrown.
   */
  onError?: (event: BuilderErrorEvent) => void
}
```

Delete `onZodError` from `BuilderConfig`.

**Step 2: Update `handleError`**

Build a `BuilderErrorEvent` from the thrown value and fire `config.onError(event)`. The legacy `onZodError` is gone — `kind === 'validation'` is now a filter on the structured event.

**Step 3: Update `create-handler.mts`**

In every error path (envelope branch and legacy data branch), construct the event before throwing / returning:

```ts
function fireOnError(config: BuilderConfig, classified: EnvelopeError, endpoint: { method: HttpMethod; url: string }) {
  if (!config.onError) return
  const event: BuilderErrorEvent = {
    kind: classified.kind,
    endpoint,
    status: 'status' in classified ? classified.status : undefined,
    zodIssues: classified.kind === 'validation' ? classified.issues : undefined,
    cause: classified.kind === 'network' ? classified.cause : undefined,
    body: 'body' in classified ? classified.body : undefined,
  }
  config.onError(event)
}
```

**Step 4: Drop `onFail` from react-query helpers**

In `make-options.mts`, `make-infinite-options.mts`, `make-hook.mts`, remove the `onFail` field from params and the `if (options.onFail) options.onFail(err)` calls. Users who want telemetry register `onError` on the builder.

In every `client/types/*.mts`, drop `onFail` from the surface configs.

**Step 5: Add tests**

`packages/builder/src/__tests__/on-error.spec.mts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { builder } from '../builder.mjs'

import type { BuilderErrorEvent, Client } from '../types/index.mjs'

describe('onError event', () => {
  it('fires for HTTP errors with kind, status, body, endpoint', async () => {
    const events: BuilderErrorEvent[] = []
    const api = builder({ onError: (e) => events.push(e) })
    api.provideClient({
      request: () => Promise.reject({ response: { data: { msg: 'gone' }, status: 404, statusText: 'NF', headers: new Headers() } }),
    } as Client)
    const ep = api.declareEndpoint({
      method: 'GET',
      url: '/u',
      responseSchema: z.object({ name: z.string() }),
      errorSchema: { 404: z.object({ msg: z.string() }) },
      result: 'envelope',
    })
    await ep({})
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: 'http',
      status: 404,
      endpoint: { method: 'GET', url: '/u' },
    })
  })

  it('fires for validation errors with zodIssues', async () => { /* similar */ })
  it('fires for network errors with kind: network, no status', async () => { /* similar */ })
  it('fires for legacy data-mode throws (still fires onError, then rethrows)', async () => { /* similar */ })
})
```

**Step 6: Verify & commit**

```bash
yarn turbo run test:ci --filter=@navios/builder --filter=@navios/react-query
yarn turbo run lint --filter=@navios/builder --filter=@navios/react-query
git add packages/builder/ packages/react-query/
git commit -m "refactor(builder, react-query)!: consolidate onError / onZodError / onFail into one BuilderErrorEvent hook"
```

---

## Task 11: Small cleanups

Bundles §3.8, §3.9, §3.10 into one task since each is small.

### 11a: Move `isResponseEnvelope` to `errors/guards.mts`

**Files:**
- Modify: `packages/builder/src/types/envelope.mts` — delete the runtime function.
- Modify: `packages/builder/src/errors/guards.mts` — add the runtime function.
- Modify: `packages/builder/src/errors/index.mts` and consumers.

```bash
grep -rn "isResponseEnvelope" packages/builder/src packages/react-query/src --include='*.mts'
```

Update each import to point at `@navios/builder` (the public re-export should already cover both).

Commit:

```bash
git commit -am "refactor(builder): move isResponseEnvelope to errors/guards.mts to keep types/ type-only"
```

### 11b: Tighten `AbstractRequestConfig`

**File:** `packages/builder/src/types/common.mts`

Currently:

```ts
export interface AbstractRequestConfig {
  params?: ...
  method?: HttpMethod
  url: string
  data?: any
  headers?: Record<string, string>
  signal?: AbortSignal | null
  [key: string]: any
}
```

Replace the index signature with a typed `clientOptions` slot:

```ts
export interface AbstractRequestConfig {
  params?: Record<string, unknown> | URLSearchParams
  method?: HttpMethod
  url: string
  data?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal | null
  clientOptions?: Record<string, unknown>
}
```

Check all adapters / handlers that previously relied on the index signature for axios-style `timeout` / `responseType` etc. Move those into `clientOptions` or surface them as first-class fields. Look at `packages/builder/src/handlers/stream.mts` (uses `responseType: 'blob'` via transformRequest) — if it spreads into the config object, route it through `clientOptions` or add `responseType` as a first-class optional field.

Commit:

```bash
git commit -am "refactor(builder)!: replace AbstractRequestConfig index signature with typed clientOptions slot"
```

### 11c: Trim type-test matrix

**Files:** `packages/react-query/src/client/__type-tests__/*.spec-d.mts`

Each file currently enumerates ~35-40 combinations of `(querySchema, requestSchema, errorSchema, urlParamsSchema)`. With Task 7's collapse, these are properties of `Options`, not of each surface.

For each per-surface test file:
- Keep the surface-specific assertions (e.g. cache-key shape for query, mutate-args for mutation, page-param for infinite).
- Delete combinations already covered by `packages/builder/src/types/__type-tests__/builder-instance.spec-d.mts` and the new envelope type tests.

Aim for ~10 tests per surface (down from 35-40).

Run after trimming:

```bash
yarn turbo run test:ci --filter=@navios/react-query
```

If a deleted assertion was actually load-bearing (i.e., it caught a regression no other test does), restore it. Be conservative — when in doubt, keep.

Commit:

```bash
git commit -am "test(react-query): trim per-surface type-test matrix to surface-specific assertions"
```

---

## Task 12: Docs and version bump for v2

**Files:**
- Modify: `packages/builder/CHANGELOG.md`
- Modify: `packages/builder/README.md` (envelope foot-gun warnings, Headers serializability note, Object.freeze consistency note)
- Modify: `packages/builder/package.json` — bump to `2.0.0`
- Modify: `packages/react-query/CHANGELOG.md`
- Modify: `packages/react-query/README.md`
- Modify: `packages/react-query/package.json` — bump to `2.0.0`
- Modify: `specs/navios-builder.md`, `specs/navios-react-query.md` — update for v2

**Step 1: Update both CHANGELOGs**

Replace the `2.0.0-alpha.1` / `1.1.0` entries from PR #55 with a single `2.0.0` block per package documenting the full v2 (envelope mode + simplifications):

```markdown
## [2.0.0] - 2026-05-14

### Added (from envelope feature)
- ... (see PR #55 entries) ...

### Changed
- `BuilderInstance`, `EndpointHandler`, `StreamHandler`, `InferEndpointReturn` no longer carry the `UseDiscriminator` generic.
- Client configs in `@navios/react-query` derive from `EndpointOptions` rather than re-declaring fields. The `query`, `mutation`, `infiniteQuery`, and multipart methods now take 2-3 generics instead of 11-15.
- `onError` callback now receives a structured `BuilderErrorEvent` (kind, endpoint, status, zodIssues, cause, body) instead of a raw `unknown`.

### Removed
- `useDiscriminatorResponse` config flag (use `result: 'envelope'` instead).
- `onZodError` callback (use `onError` with `event.kind === 'validation'`).
- `onFail` option on react-query helpers (use builder `onError`).
- `isErrorStatus`, `isErrorResponse` guards (use `isHttpError`, `isEnvelopeError`).
- `InferErrorSchemaOutputWithStatus` (use `EnvelopeError`).
- `__status` injection on parsed error bodies.
- Legacy `BaseEndpointConfig`, `BaseStreamConfig`, `AnyEndpointConfig`, `AnyStreamConfig`, `StreamOptions` alias.
- `AbstractEndpoint<Config>` from `@navios/react-query` (use `EndpointHandler<Options>`).
- `ClientEndpointHelper` deprecated alias.
- Dual-signature pattern in `EndpointHelper` and `StreamHelper`.
- `UnknownResponseError` (envelope mode classifies these as `http-unknown`).

### Migration
- Replace `useDiscriminatorResponse: true` with per-endpoint `result: 'envelope'` (or `defaults: { result: 'envelope' }`).
- Replace `isErrorStatus(result, 404)` with `isHttpError(envelope.error, 404)` after destructuring the envelope.
- Replace `onError: (e) => log(e)` with `onError: (event) => log(event.cause, event.kind)`.
- Drop `processResponse: (data) => data` boilerplate — `processResponse` is now optional everywhere.
```

**Step 2: README warnings (builder)**

Add to `packages/builder/README.md` under the envelope section:

```markdown
### Foot-guns to be aware of

- **`builder({ defaults: { result: 'envelope' } })` is a global contract change.** Every endpoint declared on that builder now returns an envelope instead of throwing. Catch blocks that previously caught HTTP failures silently stop catching — failing assignments will surface as runtime errors at the destructuring site. Prefer per-endpoint opt-in unless you're rewriting your whole call site.

- **`response.headers` is a Fetch `Headers` instance**, which is **not JSON-serializable**. SSR hydration, React Query's persister, and `localStorage` will silently lose headers. If you need to persist envelopes, convert with `Array.from(envelope.response.headers.entries())` first.

- **`Object.freeze` is applied to `EnvelopeError['http']` bodies only.** Other variants (`http-unknown`, `validation`) leave their `body` mutable. Don't rely on freezing for runtime safety.
```

**Step 3: README warnings (react-query)**

Add to `packages/react-query/README.md` near the envelope section:

```markdown
### Subtle behavior

- The `onError` hook in TanStack Query receives a TanStack `Error`. To get the typed envelope error, either use `unwrap: 'throw-on-error'` (envelope errors flow through RQ's error channel typed as `EnvelopeError`) or destructure the envelope from `data` in `unwrap: 'none'` mode.

- `processResponse` in envelope mode + `unwrap: 'none'` receives the full envelope. If you only want to project a field from `envelope.data`, prefer TanStack's `select` over `processResponse` — `processResponse` re-runs on every cache write, `select` only on read.
```

**Step 4: Version bumps**

```bash
# packages/builder/package.json
"version": "2.0.0"

# packages/react-query/package.json
"version": "2.0.0"
```

**Step 5: Update specs**

`specs/navios-builder.md` and `specs/navios-react-query.md` — update to reflect the v2 shape:
- Remove references to `UseDiscriminator`.
- Remove `useDiscriminatorResponse`, `__status`, `isErrorStatus`, `isErrorResponse`.
- Update API tables to show the new derived-from-Options config types.
- Document the structured `onError` event.

**Step 6: Verify**

```bash
yarn turbo run lint --filter=@navios/builder --filter=@navios/react-query
yarn turbo run test:ci --filter=@navios/builder --filter=@navios/react-query
yarn turbo run build --filter=@navios/builder --filter=@navios/react-query
```

All green.

**Step 7: Commit**

```bash
git add packages/builder/CHANGELOG.md packages/builder/README.md packages/builder/package.json
git add packages/react-query/CHANGELOG.md packages/react-query/README.md packages/react-query/package.json
git add specs/navios-builder.md specs/navios-react-query.md
git commit -m "docs!: document v2 simplification, bump packages to 2.0.0"
```

---

## Phase wrap-up

After Task 12:

```bash
yarn build         # full repo
yarn test:ci       # full repo
yarn turbo run lint
```

All packages green. Open the PR:

```bash
git push -u origin feat/v2-simplification
gh pr create --base next --title "feat!: v2 architecture simplification" --body "<see design doc>"
```

Once PR #55 (envelope) and this PR are both merged to `next`, do a final QA pass on the integrated `next` branch, then open `next → main` for the v2.0.0 release.

---

## Out of scope (for follow-up)

These were flagged in the design but excluded from this plan:
- TanStack Query's `TError` plumbing on hook returns (would require deeper type surgery).
- Splitting `RequestArgs` into `ServerRequestArgs<Options>` and `ClientRequestArgs<Options>`.
- Socket / SSE config-shape audit.
- A codemod for users migrating from v1.

These can be standalone follow-ups against `next` before the final v2.0.0 tag, or post-v2.0.
