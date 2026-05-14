# Navios v2 — Round 2 Architecture Simplification

**Date:** 2026-05-14
**Status:** Design
**Affected packages:** `@navios/builder`, `@navios/react-query`, `@navios/queues` (test config), `examples/*`
**Target:** Same v2.0.0 release — landing on `next` alongside the round-1 simplification before tagging.

---

## 0. Why a second round

Round 1 of v2 (already merged to `next`) addressed the headline problems: dropping `UseDiscriminator`, consolidating error callbacks, decomposing `createHandler`, deleting legacy hierarchies. But several second-order items surfaced during execution and review that are too small to defer to v3 and too connected to leave hanging.

The user reviewed the prioritized inventory and selected **items 1–6 and 8–13** to land in v2. Item 7 (`@navios/queues` vitest config) is intentionally skipped per their direction.

This round is sized at ~15 tasks total, with three meaningful breaking changes (items 2, 4, 5) plus ten finishing items. Item 1 (socket/SSE audit) shrank dramatically after investigation — those subpackages already follow the v2 patterns.

**Reference inventory:** items numbered as in my response to the user.

---

## 1. Items and approach

### 1.1 Item 1 — Socket / SSE alignment

**Finding from audit:** socket and eventsource subpackages have **none** of the round-1 friction. No `UseDiscriminator`-equivalent generic. No legacy parallel hierarchies. No global return-type flags. No `__status` injection. No dual-signature helpers. They post-date the const-generic refactor and were built right.

The only real friction is **error-callback divergence** between subpackages:

- **Socket** (`socketBuilder` config): `onValidationError`, `onAckTimeout`. No generic `onError`.
- **EventSource** (`eventSourceBuilder` config): `onValidationError`, `onError`.
- **Main builder** (post round 1): `onError(BuilderErrorEvent)` — structured event with `kind`, `endpoint`, `status`, `zodIssues`, `cause`, `body`.

Three small alignments:

**(a) Unify error events across all three builders.** Extend the same `onError(BuilderErrorEvent)` pattern to socket and eventsource. `BuilderErrorEvent` already has `kind: 'http' | 'http-unknown' | 'validation' | 'network'` — extend the union to include `'socket'` and `'event-source'` (or use a more abstract `kind: 'validation' | 'transport'` split). Socket's `onValidationError` and `onAckTimeout` become specializations of the unified hook. EventSource's `onError` and `onValidationError` likewise.

**Recommended shape:**
```ts
export type BuilderErrorKind =
  | 'http' | 'http-unknown' | 'validation' | 'network'  // main builder
  | 'socket-ack-timeout' | 'socket-transport'           // socket
  | 'event-source-transport'                            // eventsource

export interface BuilderErrorEvent {
  kind: BuilderErrorKind
  endpoint: { method?: HttpMethod; url: string }  // method optional for socket/SSE
  status?: number
  zodIssues?: readonly $ZodIssue[]
  cause: unknown
  body?: unknown
  // Socket/SSE-specific
  topic?: string
  eventName?: string
}
```

Socket and EventSource each drop their own `onError`/`onValidationError`/`onAckTimeout` in favor of the unified hook. Documentation updates per package.

**(b) Tests:** Update socket and eventsource tests to assert on the new event shape. The breakdown should follow the round-1 pattern (one `on-error.spec.mts` per subpackage exercising each kind).

**(c) Footgun fix:** Socket currently has no generic `onError` — handler-execution errors fail silently. The unified hook fixes this by definition.

**Estimate:** 3 tasks (one per subpackage, one for the cross-builder type unification).

### 1.2 Item 2 — Drop `processResponse`, document `select` as the replacement

**The case for removal:**
- `processResponse` lives in 16 source files of `@navios/react-query`.
- Its semantics fork by mode: data → receives parsed body; envelope+`unwrap: 'none'` → receives whole envelope; envelope+`unwrap: 'throw-on-error'` → receives unwrapped data. Three shapes through one parameter. The round-1 final reviewer flagged this as a footgun.
- TanStack Query has a first-class `select` option that does the same projection, but only on read (not on cache write), is properly typed, and is the idiomatic React Query pattern.
- Removing `processResponse` collapses `OptionsFromInline` (the Task 6 bridge that exists only because `processResponse`'s `data` parameter needs contextual typing) — which in turn enables the **single-Options generic pattern** that the round-1 Task 7 implementer couldn't achieve.

**Migration:**
```ts
// Before — round 1 syntax
const getUser = client.query({
  method: 'GET',
  url: '/users/$id',
  responseSchema: userSchema,
  processResponse: (data) => ({ ...data, displayName: `${data.name} (${data.email})` }),
})
const { data } = getUser.use({ urlParams: { id: '1' } })
// data: { id, name, email, displayName }

// After — v2 final
const getUser = client.query({
  method: 'GET',
  url: '/users/$id',
  responseSchema: userSchema,
})
const { data } = getUser.use(
  { urlParams: { id: '1' } },
  { select: (data) => ({ ...data, displayName: `${data.name} (${data.email})` }) },
)
```

For mutations, the equivalent is `useMutation({ ..., onSuccess: (data) => transform(data) })` if the projection is for a side effect, or a simple wrapper in user code.

For infinite queries, `select` operates on `InfiniteData<TPage>`.

**Surface changes:**
- Delete `processResponse?:` from `QueryEndpointConfig`, `InfiniteQueryEndpointConfig`, `MutationEndpointConfig`, `MultipartMutationEndpointConfig`, all `xxxFromEndpoint` option types, and `MakeQueryOptionsParams` / `MakeMutationParams` / `MakeInfiniteQueryOptionsParams`.
- Delete the runtime identity-default fallback in `make-options.mts`, `make-hook.mts`, `make-infinite-options.mts`.
- Update `use()` and `useSuspense()` helpers to accept an optional second argument `{ select? }` forwarded to TanStack.
- `ComputeResult<Options, Unwrap>` no longer needs to bridge to a `Result` type — it produces the wire type, and `select` does any subsequent projection. The third generic (`Result`) on each surface method disappears.
- `OptionsFromInline` becomes deletable: with no `processResponse` field on configs, configs become "`Options extends EndpointOptions` plus optional `unwrap`," which TS CAN infer cleanly as a single generic.

**Risk:** This is a breaking API change for every existing call site. CHANGELOG-noisy but a real ergonomics win.

**Estimate:** 3 tasks (delete from types + impl, update all 16+ surface files, add `select` forwarding to use/useSuspense helpers, doc + migration examples).

### 1.3 Item 3 — `@ts-expect-error` cleanup (14 sites in `declare-client.mts`)

The 14 break into clusters:
- **7-block at lines 365–377** — all "`@ts-expect-error` We simplified types here", one per surface method on the returned client object. These are likely all resolved together by **item 4** (collapsing the surface) because the impl signature stops needing to differ from the interface declaration.
- **Lines 175, 214** — "We attach the endpoint to the queryOptions / infiniteQueryOptions". The runtime mutates the returned object to add `.endpoint`. A cleaner fix: declare the result type with the attached `endpoint` field from the start, so the assignment is well-typed.
- **Lines 261, 346** — "Type inference for errorSchema variants". Likely resolved by item 2 (removing `processResponse` which complicates the inference) or absorbed in item 4.
- **Lines 275, 359** — "We attach the endpoint to the useMutation" — same pattern as 175/214 fix.
- **Line 319** — "endpoint types are compatible at runtime". Probably surface-specific narrowing that the round-2 work resolves naturally.

**Estimate:** 1-2 dedicated tasks AFTER items 2 and 4. Most likely they evaporate without direct work.

### 1.4 Item 4 — Collapse `client.query` and `client.queryFromEndpoint` (and equivalents)

Today the surface has seven methods:
- `query` / `queryFromEndpoint`
- `mutation` / `mutationFromEndpoint`
- `infiniteQuery` / `infiniteQueryFromEndpoint`
- `multipartMutation`

The split is "inline config vs existing endpoint." After round 1, the inline path is essentially `api.declareEndpoint(config)` followed by the from-endpoint wrap. Collapse via overload:

```ts
interface ClientInstance {
  query<const Options extends EndpointOptions>(
    configOrEndpoint: Options | EndpointHandler<Options>,
    opts?: QueryOptions<Options>,
  ): QueryResult<Options>
  
  mutation<const Options extends EndpointOptions>(
    configOrEndpoint: Options | EndpointHandler<Options>,
    opts?: MutationOptions<Options>,
  ): MutationResult<Options>

  infiniteQuery<const Options extends EndpointOptions & { querySchema: ZodObject }>(
    configOrEndpoint: Options | EndpointHandler<Options>,
    opts: InfiniteQueryOptions<Options>,  // getNextPageParam still required
  ): InfiniteQueryResult<Options>

  multipart<const Options extends EndpointOptions>(
    configOrEndpoint: Options | EndpointHandler<Options>,
    opts?: MutationOptions<Options>,
  ): MutationResult<Options>
}
```

Runtime detection: if the input has a `.config` property, it's an `EndpointHandler`; otherwise it's a config. The implementation does the `api.declareEndpoint(config)` step inline.

**Cost:** TanStack's overload resolution can be brittle on union-typed first parameters. Need a careful prototype before committing.

**Estimate:** 4 tasks (one per surface family). Combined commit OK if it stays under ~500 lines.

### 1.5 Item 5 — Split `RequestArgs` server / client

`RequestArgs<Url, QuerySchema, RequestSchema, UrlParamsSchema, IsServer = false>` currently uses `IsServer` to switch between `z.input` (client-side) and `z.output` (server-side handler) types. The boolean generic threads through every signature that touches it.

**Proposal:**
```ts
export type ClientRequestArgs<Options extends EndpointOptions> = Simplify<{...}>  // z.input
export type ServerRequestArgs<Options extends EndpointOptions> = Simplify<{...}>  // z.output
```

All client-facing types use `ClientRequestArgs`; the server framework integration (`@navios/core` or wherever server handlers are typed) uses `ServerRequestArgs`. The `IsServer` boolean disappears.

**Estimate:** 2 tasks (define the two types + replace all `RequestArgs<…, true>` usages with `ServerRequestArgs`).

### 1.6 Item 6 — Examples migration

`examples/simple-test/src/api/index.mts:6` uses `useDiscriminatorResponse: true` — broken on v2. Other example apps may have similar issues:
- `examples/openapi/`, `examples/otel-bun/`, `examples/otel-fastify/`, `examples/adapter-xml/`, `examples/e2e-fastify-legacy/`, `examples/e2e-bun-stage3/`, `examples/e2e-fastify-stage3/`, `examples/e2e-bun-legacy/`, `examples/simple-test/`

Scan and migrate each to v2 patterns:
- Replace `useDiscriminatorResponse: true` + `isErrorStatus`/`isErrorResponse` with `result: 'envelope'` + `isHttpError`/`isEnvelopeError`.
- Remove `processResponse: (data) => data` calls (after item 2 lands).
- Migrate `onError(error)` to `onError(event)` shape.

**Estimate:** 1 task (combined sweep). Each example takes ~5 minutes.

### 1.7 Items 8–13 (small finishing items)

| # | Item | Effort |
|---|------|--------|
| 8 | `BuildEndpointOptions` (in `query.mts`) + `OptionsFromInline` (in `helpers.mts`) dedup → one helper | 1 task; likely auto-resolved by item 2 (processResponse removal lets us eliminate both) |
| 9 | Inline `EndpointHelper<Options>` at its 6 call sites; delete the type | 1 task |
| 10 | JSDoc sweep — remove references to removed types (`UseDiscriminator`, `useDiscriminatorResponse`, etc.) and outdated comments | 1 task |
| 11 | Attach `.endpoint` to `mutationFromEndpoint` for parity with `mutation` / `multipartMutation` | Combined with item 3 fix |
| 12 | Remove `as` cast on `createHandler` selector's `opts.options.result` (`BaseEndpointOptions.result` is first-class) | 1-liner, combined with 13 |
| 13 | Extract `shouldValidate` into a helper (computed twice in `runEnvelope` and `runData`) | 1-liner, combined with 12 |

**Estimate:** 4 tasks (items 9, 10, 11+3 cluster, 12+13).

---

## 2. Sequencing

Some tasks depend on others. The order matters for cleanly evaporating workarounds rather than fighting them:

1. **Task A — Tiny finishing items (items 12, 13):** `as` cast cleanup, `shouldValidate` helper. No dependencies, instant win.
2. **Task B — Drop `processResponse` (item 2):** The biggest unlocker. Touches 16 files; deletes `OptionsFromInline` after.
3. **Task C — Delete `BuildEndpointOptions` (item 8):** Falls out cleanly once item 2 lands.
4. **Task D — Collapse client surface methods (item 4):** Three to four sub-tasks (one per surface family). Resolves most of the 7-block `@ts-expect-error` cluster.
5. **Task E — Inline `EndpointHelper` (item 9):** Trivial after item 4.
6. **Task F — `.endpoint` attachment fixes + remaining `@ts-expect-error` cleanup (items 3, 11):** Mostly the runtime mutation pattern — declare the type up front instead of casting.
7. **Task G — `RequestArgs` server/client split (item 5):** Independent; can be parallel.
8. **Task H — Socket/SSE error-hook unification (item 1):** Independent; can be parallel.
9. **Task I — Examples migration (item 6):** After all type changes settle.
10. **Task J — JSDoc sweep (item 10):** Last; absorb all the renames and removals.

If we land these as one big PR, the merge order is A → B → C → D → E → F → G in parallel with → H in parallel with → I → J.

If we want PR-per-task: A is one PR, B+C combined (they're tightly coupled), D is one PR (or 4 mini PRs), E+F+I+J combined, G separate, H separate. Roughly 5–6 PRs total.

**My recommendation: one branch, many commits.** Same shape as the round-1 simplification — easier to review the whole v2 picture in a single PR.

---

## 3. Goals

After round 2:
- `processResponse` removed everywhere; `select` documented as the projection mechanism.
- `BuildEndpointOptions` and `OptionsFromInline` deleted; configs derive directly from `Options extends EndpointOptions`.
- Client surface collapsed to 4 methods (`query`, `mutation`, `infiniteQuery`, `multipart`), each accepting either a config or an existing `EndpointHandler`.
- `@ts-expect-error` count in `declare-client.mts` drops from 14 to 0.
- `EndpointHelper<Options>` deleted (inlined where used).
- Socket and EventSource use the same `onError(BuilderErrorEvent)` hook as the main builder.
- `RequestArgs<...IsServer>` split into `ClientRequestArgs` and `ServerRequestArgs`; no boolean generic.
- All example apps compile against v2.
- JSDoc is consistent with v2 reality.

Expected net delta: another ~600–800 lines deleted, ~200 lines added (mostly tests and JSDoc). Combined with round 1: roughly **−1,500 net lines from `next`'s pre-v2 baseline.**

---

## 4. Non-goals

- TanStack's own `TError` typing on hook returns (still loose `Error`). Truly out of scope for v2; needs deep TS surgery.
- A codemod for v1 → v2 users.
- Refactoring `@navios/queues` or other unrelated packages.
- Documenting v2 in long-form blog or migration guide (the CHANGELOG entries are enough).

---

## 5. Decisions made on the user's behalf

| # | Decision | Alternative |
|---|----------|-------------|
| 1 | Unify `BuilderErrorEvent` to cover socket/SSE with extended `kind` union | Keep separate event types per builder |
| 2 | Remove `processResponse` entirely; document `select` as the replacement | Keep `processResponse` but deprecate; remove in v3 |
| 3 | Collapse `client.query` and `client.queryFromEndpoint` to one method via union-type first arg | Keep both; just clean up types |
| 4 | One PR, many commits (mirrors round 1) | PR-per-item (~5–6 PRs) |
| 5 | Land as part of v2.0.0 before tagging (per user's direction) | Defer to v2.1 |
| 6 | Skip item 7 (`@navios/queues` vitest config) per user's direction | Include it |
| 7 | `IsServer` boolean → two separate types (`ClientRequestArgs` / `ServerRequestArgs`) | Keep boolean, just rename for clarity |

---

## 6. Risks

1. **TanStack overload resolution for collapsed surface methods (item 4):** The union type `Options | EndpointHandler<Options>` as a first arg may confuse TS inference. Need a quick prototype before committing the full refactor. If it doesn't work cleanly, fall back to two methods with shared internals.
2. **`processResponse` removal (item 2) breaks every existing consumer:** This is a v2 release, so the break is expected, but it's the largest single change in round 2. Solid CHANGELOG migration examples are non-negotiable.
3. **Socket/SSE error-hook unification (item 1) is a public API break for those subpackages.** Documented in their respective CHANGELOGs.
4. **`@ts-expect-error` count of 14 is suspiciously high.** Some may be load-bearing — the type system is hiding real type holes that the assertions paper over. Cleanup may reveal genuine bugs.

---

## 7. Effort estimate

| Item | Tasks | Risk |
|------|-------|------|
| 12 + 13 (tiny finishing items) | 1 | trivial |
| 2 (processResponse → select) | 3 | medium (big breaking change) |
| 8 (BuildEndpointOptions + OptionsFromInline dedup) | 1 | low |
| 4 (collapse client surface) | 4 | medium (TS inference risk) |
| 9 (inline EndpointHelper) | 1 | low |
| 11 + 3 (.endpoint + ts-expect-error cleanup) | 2 | low |
| 5 (RequestArgs split) | 2 | low |
| 1 (socket/SSE error hook) | 3 | low |
| 6 (examples migration) | 1 | trivial |
| 10 (JSDoc sweep) | 1 | trivial |
| **Total** | **~19** | |

~2–3 days of focused execution at the pace of round 1.

---

## 8. What this does NOT do

- Doesn't introduce new features. Round 2 is purely cleanup + migration.
- Doesn't touch the socket/SSE config-shape design (already clean).
- Doesn't change envelope mode semantics.
- Doesn't change the runtime behavior of any non-error code path. The breaking changes are surface (callbacks, options shapes); the wire behavior is unchanged.
