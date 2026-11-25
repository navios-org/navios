# Navios Architecture Simplification

**Date:** 2026-05-14
**Status:** Design
**Affected packages:** `@navios/builder`, `@navios/react-query`
**Targets:** `@navios/builder` v2.0 (consolidate with envelope mode), `@navios/react-query` v2.0

---

## 0. Why this exists

The just-merged envelope feature ([PR #55](https://github.com/navios-org/navios/pull/55)) touched 49 files / ~2,800 lines and required **mid-stream course corrections at 5 different points**:

- `HttpErrorVariant` had to become a distributive union after the spec couldn't narrow `body`.
- `classifyError` had to become generic on `E` after the return type collapsed to `EnvelopeError<undefined>`.
- The validation-on-2xx branch had to bypass `classifyError` (it misclassified 2xx Zod failures as `http-unknown`).
- `makeInfiniteQueryOptions` had to be widened from `AbstractEndpoint<Config>` to `EndpointHandler<Options, …>` so envelope endpoints could be passed without a cast.
- The inline `client.query({ result: 'envelope' })` surface had `result` accepted at runtime but ignored at the type level — the result type didn't branch on it.

None of these were "we forgot something." They were **architectural friction**: the type plumbing forces every cross-cutting feature to land in N places, and those N places drift.

This document catalogs the friction and proposes a consolidated cleanup. Every item below is grounded in something I tripped over during PR #55.

---

## 1. Goals & non-goals

### Goals

1. **Adding a new endpoint field requires editing ≤ 2 files.** Today it requires ~6 (each per-surface config + the helper that computes the result type). The fix is to make client configs **derive from `EndpointOptions`** instead of redeclaring its fields.
2. **One canonical "endpoint" type pair.** Today there are at least three: `EndpointOptions` / `EndpointHandler`, the legacy `BaseEndpointConfig` / `BaseStreamConfig` / `AnyEndpointConfig`, and `AbstractEndpoint<Config>`. Keeping one pair removes ~250 lines of dead-or-deprecated types.
3. **Remove the `UseDiscriminator` generic.** It threads through 14 type declarations purely to keep `useDiscriminatorResponse: true` alive. Once that flag goes, those generics collapse.
4. **One coherent error story.** Today there are `onError`, `onZodError`, and `onFail` callbacks at three different layers with subtly different contracts. They serve one purpose: "tell me something went wrong." One hook is enough.
5. **Stop the type-test combinatorial explosion.** `__type-tests__/` already has 250+ assertions across the two packages; each new option doubles the matrix. We can structure tests so most combinations are checked once, not per surface.

### Non-goals

- Renaming `declareEndpoint`, `declareStream`, `declareMultipart`. Names are entrenched.
- Replacing TanStack Query or Zod.
- Rewriting `@navios/http`. The lower-level client is fine.

---

## 2. The duplication, line by line

To make the case concretely: here is the current `client.query` config type, abbreviated for emphasis:

```ts
// packages/react-query/src/client/types/query.mts
interface QueryEndpointConfig<
  Method, Url, QuerySchema, RequestSchema, ResponseSchema,
  ErrorSchema, UrlParamsSchema, ResultModeT, Unwrap, TBaseResult, Result,
> extends EndpointOptions {
  method: Method
  url: Url
  querySchema?: QuerySchema
  requestSchema?: RequestSchema
  responseSchema: ResponseSchema
  errorSchema?: ErrorSchema
  urlParamsSchema?: UrlParamsSchema
  processResponse?: (data: TBaseResult) => Result
  result?: ResultModeT
  unwrap?: Unwrap
}
```

Things wrong here:

- It `extends EndpointOptions` AND **re-declares every single field**. The `extends` is decorative; if you delete it the type still compiles.
- Each field becomes a typed generic, so the surrounding `query<…>(config)` method has 11 generic parameters.
- Every new builder field has to be: (1) added to `BaseEndpointOptions`, (2) added as a generic on this interface, (3) added as a field on this interface, (4) added as a generic on the `query` method, (5) added to `BuildEndpointOptions`, (6) added to `ComputeQueryResult`.
- `MutationEndpointConfig` has **15 generics**. `InfiniteQueryEndpointConfig` has **12**. Multipart has 4 overloads, each with a similar shape.
- `EndpointHelper` (in `helpers.mts`) has a **dual signature** (`OptionsOrMethod`, `UseDiscriminatorOrUrl`) supporting "new + legacy patterns." `StreamHelper` does the same. `ClientEndpointHelper` is a deprecated alias of `EndpointHelper`. All three could be one.

This duplication is the proximate cause of "every feature requires huge changes." Fix the duplication and most features become single-file changes.

---

## 3. Proposed architecture

### 3.1 Single canonical endpoint type pair

**Keep:**
- `EndpointOptions` — the config interface. The source of truth for what an endpoint declaration looks like.
- `EndpointHandler<Options>` — the runtime callable returned from `declareEndpoint`. Drop the `UseDiscriminator` generic (see §3.3).

**Delete (in v2.0):**
- `BaseEndpointConfig<Method, Url, QuerySchema, ResponseSchema, RequestSchema, ErrorSchema, UrlParamsSchema>` — 7-generic legacy type.
- `BaseStreamConfig<...>` — 6-generic legacy type.
- `AnyEndpointConfig` — `BaseEndpointConfig<any, any, any, any, any, any, any>`.
- `AnyStreamConfig` — `BaseStreamConfig<any, any, any, any, any, any>`.
- `StreamOptions` — currently an alias for `BaseEndpointOptions` and already JSDoc-marked deprecated.
- `AbstractEndpoint<Config>` from `@navios/react-query` — used by old `makeInfiniteQueryOptions` signature; replaced by `EndpointHandler<Options>` in Task 17.
- `ClientEndpointHelper` — deprecated alias of `EndpointHelper`.
- The "legacy 4-5-arg pattern" branch in `EndpointHelper` and `StreamHelper`.

**Net code deleted:** ~250 lines of type declarations across two packages.

### 3.2 Client configs derive from `EndpointOptions`, not redeclare it

Instead of `QueryEndpointConfig` with 11 generics, the shape becomes:

```ts
export interface QueryEndpointConfig<
  Options extends EndpointOptions,
  TBaseResult = ComputeQueryResult<Options>,
  Result = TBaseResult,
> extends Options {
  processResponse?: (data: TBaseResult) => Result
}
```

That's it. `processResponse` is the **only** field that lives in the react-query layer; everything else belongs to the builder and is inherited. `result` and `unwrap` are already on `Options` (after §3.4) so they don't need to be re-stated.

The method signature collapses from:

```ts
// before — 11 generics
query<const Method, const Url, const QuerySchema, const RequestSchema,
      const ResponseSchema, const ErrorSchema, const UrlParamsSchema,
      const ResultModeT, const Unwrap, const TBaseResult, const Result>(
  config: QueryEndpointConfig<Method, Url, ..., Result>
): ...
```

to:

```ts
// after — 3 generics
query<const Options extends EndpointOptions, const Result = ComputeQueryResult<Options>>(
  config: QueryEndpointConfig<Options, ComputeQueryResult<Options>, Result>,
): EndpointHandler<Options>['use'] & QueryHelpers<Options, Result> & EndpointHelper<Options>
```

`InferEndpointParams<Options>`, `Split<Options['url'], '/'>`, etc. already exist and consume `Options` directly. No need to re-extract every field.

`InfiniteQueryEndpointConfig` and `MutationEndpointConfig` collapse the same way. Multipart becomes `QueryEndpointConfig<Options>` with `responseType: 'multipart'` set on Options (or via a tiny `MultipartOptions` extension), not 4 separate overloads.

### 3.3 Drop `UseDiscriminator` generic

`UseDiscriminator extends boolean` threads through:

- `BuilderInstance<UseDiscriminator>`
- `EndpointHandler<Options, UseDiscriminator>`
- `StreamHandler<Options, UseDiscriminator>`
- `InferEndpointReturn<Options, UseDiscriminator>`
- `InferStreamReturn<Options, UseDiscriminator>`
- `ComputeBaseResult<UseDiscriminator, ResponseSchema, ErrorSchema>`
- `ComputeQueryResult<UseDiscriminator, ...>`
- `ComputeInfinitePageResult<UseDiscriminator, ...>`
- `EndpointHelper<Options, UseDiscriminator>`
- `StreamHelper<Options, UseDiscriminator>`
- `ClientQueryMethods<UseDiscriminator>`
- `ClientInfiniteQueryMethods<UseDiscriminator>`
- `ClientMutationMethods<UseDiscriminator>`
- `ClientFromEndpointMethods<UseDiscriminator>`

…purely to keep the legacy "errors-as-union via `responseSchema`" behavior alive. Envelope mode supersedes it entirely. The plan was always to remove it in the next major.

**v2.0 action:**
- Remove the `UseDiscriminator` generic from every type above.
- Remove the `useDiscriminatorResponse` field from `BuilderConfig`.
- Remove `InferErrorSchemaOutputWithStatus`, the `__status` injection in `handleError`, and the deprecated `isErrorStatus`/`isErrorResponse` guards.
- `handleError` becomes a thin "rethrow with optional onError telemetry hook" — see §3.5.

### 3.4 Consolidate result-type computation

After §3.3, `ComputeBaseResult`, `ComputeQueryResult`, `ComputeInfinitePageResult` collapse to one computer that takes `Options` and the (now-optional) `Unwrap` mode:

```ts
export type ComputeResult<
  Options extends EndpointOptions,
  Unwrap extends UnwrapMode = 'none',
> = Options extends { result: 'envelope' }
  ? Unwrap extends 'throw-on-error' | 'pages'
    ? z.output<Options['responseSchema']>
    : InferEndpointReturn<Options>  // = ResponseEnvelope<...>
  : InferEndpointReturn<Options>
```

`InferEndpointReturn` already branches on `Options['result']` (Task 6) so the heavy lifting is one level down. `InferStreamReturn` becomes a trivial alias `Options extends { responseSchema: ZodType } ? ... : Blob`-style, or — better — `declareStream` accepts the same `EndpointOptions` shape with `responseSchema` defaulting to `z.instanceof(Blob)`. We delete the parallel stream type hierarchy entirely.

### 3.5 One error hook

Today:

- `BuilderConfig.onError(err)` — fires for every error.
- `BuilderConfig.onZodError(err, response, originalError)` — fires only for `ZodError`, called AFTER `onError`. Lower priority.
- `MakeQueryOptionsParams.onFail(err)` — react-query-level "log this failure" hook.
- TanStack Query's own `onError` on mutations.

**Proposed: one hook, one shape.** Builder gets:

```ts
interface BuilderConfig {
  onError?: (event: BuilderErrorEvent) => void
}

interface BuilderErrorEvent {
  kind: EnvelopeError['kind']      // 'http' | 'http-unknown' | 'validation' | 'network'
  endpoint: { method: HttpMethod, url: string }
  status?: number
  cause: unknown                    // original thrown value
  zodIssues?: readonly $ZodIssue[]  // present iff kind === 'validation'
}
```

`onZodError` becomes a special case of `onError` (filter on `event.kind === 'validation'`). `onFail` in react-query is deleted — the builder hook fires for envelope and data mode equally; react-query users who want telemetry register on the builder, not on every query.

This also means the **deprecated-by-this-design** `onError(error: unknown)` shape needs a one-major bridge: detect old-shape callbacks (`fn.length === 1` + receives anything) and call them with `event.cause` for back-compat. Or simply break in v2 and document.

### 3.6 Decompose `createHandler`

Currently `createHandler` is 120 lines branching on:
- `isMultipart` (request transform)
- `transformRequest` / `transformResponse`
- `resultMode === 'envelope'` (entire alternate flow)
- `shouldValidate`
- success vs. error vs. validation paths

Two PRs into the future this will be unmaintainable. Decompose into composable pieces:

```ts
// Each is ~15 lines.
async function runRequest(
  request: HandlerRequest,
  ctx: HandlerContext,
): Promise<{ ok: true, response: AbstractResponse<unknown> } | { ok: false, error: unknown }>

function buildOk<TData>(parsed: TData, response: AbstractResponse<unknown>): ResponseEnvelopeOk<TData>
function buildErr(error: unknown, errorSchema?: ErrorSchemaRecord): ResponseEnvelopeErr<EnvelopeError>

// The two surface modes are tiny composers:
async function runEnvelope(...) { /* await runRequest; classify; build envelope */ }
async function runData(...) { /* await runRequest; parse or throw via classifier */ }

export function createHandler(opts: CreateHandlerOptions) {
  return opts.result === 'envelope' ? runEnvelope.bind(null, opts) : runData.bind(null, opts)
}
```

Each piece is testable in isolation. Adding a fourth mode (`'tuple'` à la `[err, data]`, `'iterator'` for streaming, whatever future) becomes another tiny composer.

### 3.7 Deduplicate `InferEndpointReturn` / `InferStreamReturn`

After §3.4 they share structure. Extract a single helper:

```ts
type InferReturn<Options, DataType> =
  Options extends { result: 'envelope' }
    ? ResponseEnvelope<DataType, EnvelopeError<Options['errorSchema']>>
    : DataType

export type InferEndpointReturn<Options extends EndpointOptions> =
  InferReturn<Options, z.output<Options['responseSchema']>>

export type InferStreamReturn<Options extends BaseEndpointOptions> =
  InferReturn<Options, Blob>
```

After we unify `declareStream` with `declareEndpoint` under one `EndpointOptions` shape (§3.4 last paragraph), even the surface split goes away.

### 3.8 Move `isResponseEnvelope` out of `types/envelope.mts`

The only runtime export in an otherwise type-only file. Move to `errors/guards.mts` next to `isHttpError` etc. Keeps `types/` type-only.

### 3.9 Loosen `AbstractRequestConfig`'s `[key: string]: any`

Currently:

```ts
export interface AbstractRequestConfig {
  // ...known fields...
  [key: string]: any  // Allow client-specific options
}
```

This any-types every field at consumer sites. The escape hatch was for axios-style configs (`timeout`, `responseType`, etc.). Replace with a typed `clientOptions: Record<string, unknown>` slot — narrower, still extensible.

### 3.10 Reduce the `__type-tests__/` matrix

Today, `packages/react-query/src/client/__type-tests__/` has tests per surface (`query.spec-d.mts`, `mutation.spec-d.mts`, `infinite-query.spec-d.mts`, `multipart-mutation.spec-d.mts`) each enumerating ~35-40 combinations of `(querySchema, requestSchema, errorSchema, urlParamsSchema)`. With the §3.2 collapse, these combinations are properties of `Options`, not of each surface. Two changes:

1. **Test `InferEndpointParams<Options>` and `ComputeResult<Options>` exhaustively** at the builder layer once. Every consumer derives types from these.
2. **Per-surface type tests assert only the surface-specific bits**: query asserts cache-key shape, mutation asserts mutate-args shape, infinite asserts page-param shape. ~10 tests per surface instead of 40.

Net: ~140 tests removed, faster type-check, easier to add a 16th option.

### 3.11 README foot-gun warnings (small, but worth bundling)

- `builder({ defaults: { result: 'envelope' } })` is a silent contract change for every endpoint. The README should bold-warn this.
- `Headers` is not JSON-serializable. Document the SSR / RQ-persister implication and offer `toSerializable(meta)` / `fromSerializable(...)` helpers if anyone asks.
- `Object.freeze` is currently applied only to the `http` variant body. Either apply it consistently to all `EnvelopeError` variant bodies or drop it — the inconsistency is more confusing than helpful.

### 3.12 Drop dual signatures elsewhere

`EndpointHelper<OptionsOrMethod, UseDiscriminatorOrUrl, RequestSchema, ResponseSchema, QuerySchema>` overloads for "new + legacy" — the legacy branch is dead code as soon as `UseDiscriminator` goes. `StreamHelper` is the same. `ClientEndpointHelper` (deprecated alias) deletes outright.

---

## 4. Sequencing and breaking-change strategy

This is the part the user asked about explicitly. There are three credible orderings:

### Option A — One big v2 (recommended)

Bundle envelope mode (already on the `feat/builder-response-envelope` branch) with the simplifications described here. Ship as a single `@navios/builder` v2.0 / `@navios/react-query` v2.0. Users upgrade once.

- **Pros:** Users do one migration. Internal codebase has one canonical shape. The deprecations from PR #55 (`useDiscriminatorResponse`, `isErrorStatus`, etc.) go away in the same release rather than lingering for a major cycle.
- **Cons:** Bigger blast radius per release. PR #55 isn't merged yet; this adds more risk to the same train.
- **Mitigation:** PR #55 is well-tested (785 tests). The simplifications here are mostly type-level deletions on top of envelope mode, not re-architecting; they should land cleanly.

### Option B — Envelope as v2 alpha, simplifications as v2 RC

Ship PR #55 as `2.0.0-alpha.1` (CHANGELOG already declares this). Let internal/early users try envelope mode. Then land the simplifications as `2.0.0-beta.x` → `2.0.0-rc.x` → `2.0.0`.

- **Pros:** Phased risk. Real-world feedback on envelope before locking the simplifications.
- **Cons:** Two migration milestones for early-adopter users (alpha → beta breaks them again if simplifications break public API).

### Option C — Envelope as 1.x minor, simplifications as v2

PR #55 lands as `@navios/builder` 1.1.0 (don't bump major). Simplifications become v2. Users opt into the new types when they want.

- **Pros:** Lowest-risk envelope rollout.
- **Cons:** The deprecations PR #55 introduces (`useDiscriminatorResponse` etc.) sit in 1.x for a major cycle, polluting the codebase longer.

**Recommendation: Option A.** PR #55 is already labeled `2.0.0-alpha.1` in the CHANGELOG, so the major bump is already announced. Folding these simplifications in keeps the breaking-change story coherent: "v2 is envelope mode + the cleanup that envelope mode enabled." That's a cleaner narrative than "v2 is envelope, v3 is cleanup."

---

## 5. Scope estimate

| Item | Files touched | New code | Deleted code | Risk |
|------|---------------|----------|--------------|------|
| 3.1 Delete legacy type hierarchies | ~6 | 0 | ~250 | low (types) |
| 3.2 Configs derive from Options | ~8 | ~80 | ~250 | **medium** (touches generic inference) |
| 3.3 Drop `UseDiscriminator` | ~20 | 0 | ~120 | low (mechanical) |
| 3.4 Unify result-type computer | ~3 | ~30 | ~80 | low |
| 3.5 One error hook | ~5 | ~40 | ~30 | medium (public API break) |
| 3.6 Decompose `createHandler` | ~3 | ~120 | ~80 | low (internal) |
| 3.7 Dedupe Infer*Return | ~1 | ~15 | ~25 | low |
| 3.8 Move `isResponseEnvelope` | ~3 | 0 | 0 | trivial |
| 3.9 Tighten `AbstractRequestConfig` | ~2 | ~10 | ~5 | medium (touches all client adapters) |
| 3.10 Trim type tests | ~4 | ~30 | ~250 | low (tests) |
| 3.11 README warnings | ~2 | ~30 | 0 | trivial |
| 3.12 Drop dual signatures | ~2 | 0 | ~60 | low |

**Total:** ~50 files, ~+325 lines added, ~-1,150 lines deleted. Net **~-825 lines** in a 30k-LOC codebase. Sizeable cleanup with leverage: future features cost ~1 file each instead of ~6.

---

## 6. What this does NOT solve (called out so we don't forget)

- **TanStack Query's own surface area** in our hooks. We could write a `Result`-aware wrapper that types `useQuery`'s return as `{ data: T | undefined, error: EnvelopeError<E> | null, ... }` instead of `{ data: T | undefined, error: Error | null, ... }` — but that requires hijacking the `TError` generic on every TanStack option type. Out of scope for this round; flag as a follow-up.
- **Server-side handler types.** The CHANGELOG mentions `RequestArgs` uses `z.output` for server, `z.input` for client. The dual-purpose nature could be split into `ServerRequestArgs<Options>` and `ClientRequestArgs<Options>` for clarity. Not blocking; flag.
- **Socket / SSE config shapes.** They have their own type hierarchies that escape this audit. Likely have similar duplication but worth a separate pass.

---

## 7. Decisions made on the user's behalf (called out for review)

| # | Decision | Alternatives |
|---|----------|--------------|
| 1 | Bundle all simplifications into v2 alongside envelope mode (Option A) | Phase as alpha → RC; or land as 1.x minor first |
| 2 | Configs **derive from `EndpointOptions`** rather than re-state fields | Keep duplication; add a code generator |
| 3 | One `onError` hook with a structured event | Keep three callbacks; add filtering helpers |
| 4 | Delete legacy `BaseEndpointConfig`/`BaseStreamConfig`/`AnyEndpointConfig` outright in v2 | One-major deprecation cycle (longer back-compat window) |
| 5 | Drop the `UseDiscriminator` generic entirely, not just default it to `never` | Phantom default for source-compat |
| 6 | Move `isResponseEnvelope` to `errors/guards.mts` | Leave it in `types/` |
| 7 | Tighten `AbstractRequestConfig`'s index signature | Keep it as escape hatch |
| 8 | Unify `declareStream` with `declareEndpoint` under one Options shape | Keep parallel stream type hierarchy |
| 9 | Trim type-test matrix to surface-specific bits | Keep current exhaustive enumeration |
| 10 | Sequence: simplifications land **after** envelope mode merges (rebase or follow-up PR) | Try to amend the envelope branch directly |

---

## 8. What to do next

If approved, I would:

1. Merge PR #55 (envelope mode) as is, or rebase to incorporate any small adjustments noted above.
2. Open a new branch `feat/v2-simplification` off the merged main.
3. Land the §3 items as ~10 focused PRs (or 10 commits on one PR — your call), in this order:
   - 3.3 (drop `UseDiscriminator`) — biggest dead-code removal, unblocks 3.4 and 3.2.
   - 3.4 (unify result computer) — depends on 3.3.
   - 3.2 (configs derive from Options) — the headline change.
   - 3.1, 3.7, 3.12 (delete legacy types) — clean-up sweep.
   - 3.6 (decompose `createHandler`) — internal refactor.
   - 3.5 (one error hook) — public API break, save for after the rest stabilizes.
   - 3.8, 3.9, 3.10, 3.11 — small finishing items.
4. Bump both packages to 2.0.0 (final, drop the alpha tag).

Estimated effort: ~3-4 days of focused work given the leverage. Each PR should be small and reviewable; the deletions outpace the additions.
