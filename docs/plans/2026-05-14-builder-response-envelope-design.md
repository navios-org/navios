# Response Envelope Mode for @navios/builder and @navios/react-query

**Date:** 2026-05-14
**Status:** Design
**Affected packages:** `@navios/builder`, `@navios/react-query`
**Targets:** `@navios/builder` v2.0 / `@navios/react-query` v1.0

---

## 1. Problem

Today, declared endpoints expose only the parsed body of the response:

```ts
const user = await getUser({ urlParams: { id: '1' } })
//    ^ User — no way to read status code, headers, or the raw response
```

Real-world API work routinely needs the rest of the response:

- **Pagination headers** (`Link`, `X-Next-Cursor`, `X-Total-Count`).
- **Caching primitives** (`ETag`, `Last-Modified`, `Cache-Control`).
- **Rate-limit signals** (`X-RateLimit-Remaining`, `Retry-After`).
- **Auth side effects** (a `Set-Cookie`, a refreshed JWT in a header).
- **The actual status code** (e.g. distinguishing `200` from `201` / `204`).
- **Body of an unexpected error response** — currently lost unless `errorSchema` matches.

Workarounds today force users to drop down to the raw `@navios/http` client and re-implement validation, defeating the point of declarative endpoints.

There is also accumulated complexity worth retiring:

- `useDiscriminatorResponse` is a **global builder flag** that changes the return type of every endpoint. It is awkward to opt into per-endpoint, and conflates two different behaviours (parse via `responseSchema` legacy mode vs. parse via `errorSchema`).
- The `__status` property is **mutated onto parsed error data** — surprising and brittle when an `errorSchema` entry happens to define a `__status` field.
- `processResponse: (data) => data` is required boilerplate in `@navios/react-query` on virtually every query.

A previous attempt — `useWholeResponse` — shipped as documentation in v0.5.0 but was never implemented and was reverted. This design lands the same intent, properly.

---

## 2. Goals & non-goals

### Goals

1. **Per-endpoint opt-in** to receive the whole HTTP response (status, headers, statusText) alongside parsed body.
2. **First-class error envelopes**: when opted in, errors are values, not exceptions — including HTTP errors with a body, network errors, and Zod validation failures, with full type discrimination across `errorSchema` entries.
3. **End-to-end type safety**: TanStack Query hooks expose the envelope shape transparently. No `as` casts in user code.
4. **Extensibility**: a single `ResponseEnvelope` shape that downstream packages (react-query, openapi, future SDKs) can rely on without each rolling their own.
5. **Path to remove `useDiscriminatorResponse`** (and its `__status` injection) without breaking the world overnight.

### Non-goals

- Replacing `@navios/http` `NaviosResponse`; we wrap it.
- Changing socket / eventsource declaration ergonomics (out of scope here, but envelope concepts may inspire a follow-up there).
- Streaming responses do not get envelope mode in v1 (the body is already opaque; status/headers can be added later as a small extension).

---

## 3. The new API surface

### 3.1 Envelope shape

Add a single canonical type, exported from `@navios/builder`:

```ts
export interface ResponseMeta {
  status: number
  statusText: string
  headers: Headers  // native Fetch Headers — has .get(), .has(), .entries()
}

// Success branch
export interface ResponseEnvelopeOk<TData> {
  ok: true
  data: TData
  error: null
  response: ResponseMeta
}

// Error branch — fully discriminated over errorSchema status codes
export interface ResponseEnvelopeErr<TError> {
  ok: false
  data: null
  error: TError
  response: ResponseMeta | null  // null only when there was no HTTP response (e.g. network failure)
}

export type ResponseEnvelope<TData, TError> =
  | ResponseEnvelopeOk<TData>
  | ResponseEnvelopeErr<TError>
```

`error` is itself a discriminated union (see §3.3). `data` and `error` are mutually exclusive but both are always present on the type so destructuring is ergonomic:

```ts
const { data, error, response } = await getUser({ urlParams: { id: '1' } })
if (error) {
  // narrowed: data is null, response is ResponseMeta | null
  return handle(error)
}
// narrowed: data is User, response is ResponseMeta
```

This mirrors patterns familiar from Apollo, urql, and Supabase, while being structurally compatible with TanStack Query's `{ data, error }` (see §5).

### 3.2 Opting in

Add a discriminated config option to `EndpointOptions` / `BaseEndpointOptions`:

```ts
declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: UserSchema,
  errorSchema: { 404: NotFoundSchema, 401: UnauthorizedSchema },
  result: 'envelope',   // 'data' (default) | 'envelope'
})
```

**Why `result: 'envelope'` rather than a boolean?** Booleans don't compose. Future modes (`'raw'` to bypass Zod parsing, `'tuple'` for `[err, data]`-style) are reasonable extensions; a union leaves the door open without another flag.

`result` is settable on all three declarators (`declareEndpoint`, `declareMultipart`, and — opportunistically — `declareStream` for status/header access on downloads).

### 3.3 Error variants in envelope mode

When `result: 'envelope'`, the `error` field is a tagged union over four cases:

```ts
type EnvelopeError<ErrorSchema, ResponseSchema> =
  | HttpErrorVariant<ErrorSchema>            // matched errorSchema entry — typed body
  | UnknownHttpErrorVariant                   // HTTP non-2xx with no matching errorSchema
  | ValidationErrorVariant                    // Zod failed on body of a 2xx or matched 4xx/5xx
  | NetworkErrorVariant                       // request never completed (timeout, DNS, CORS, abort)

interface HttpErrorVariant<E extends ErrorSchemaRecord> {
  kind: 'http'
  status: keyof E & number        // discriminator — e.g. 404 | 401
  body: { [K in keyof E]: z.output<E[K]> }[keyof E]  // matching body
}

interface UnknownHttpErrorVariant {
  kind: 'http-unknown'
  status: number                  // any status not in errorSchema
  body: unknown                   // raw, unparsed
}

interface ValidationErrorVariant {
  kind: 'validation'
  status: number
  issues: z.core.$ZodIssue[]      // from ZodError
  body: unknown                   // the raw body that failed validation
}

interface NetworkErrorVariant {
  kind: 'network'
  cause: unknown                  // original Error
  // status / body absent
}
```

The `kind` field is the primary discriminator; for `kind: 'http'` the `status` field narrows further. Type-guard helpers stay:

```ts
import { isHttpError, isValidationError, isNetworkError } from '@navios/builder'

if (isHttpError(error, 404)) error.body  // typed
```

This **replaces** the current `__status`-on-parsed-data trick. `isErrorStatus` / `isErrorResponse` are kept as deprecated aliases for one major.

### 3.4 Builder-level defaults

```ts
const api = builder({
  defaults: { result: 'envelope' },   // make envelope the default for every endpoint
  onError: (e) => { /* still fires for telemetry, even when not thrown */ },
})
```

`defaults.result` is overridable per endpoint. The standalone top-level `useDiscriminatorResponse` becomes deprecated (§7).

---

## 4. Builder internals

### 4.1 Flow change in `createHandler`

Today (`packages/builder/src/handlers/create-handler.mts:35-70`):

```
client.request(config)
  → success: responseSchema.parse(data) → return parsed
  → failure: handleError(throw or discriminate parsed body)
```

New flow when `result: 'envelope'`:

```
                                      ┌─ success → parse body → { ok:true, data, error:null, response }
client.request(config)  ──────────────┤
                                      └─ NaviosError with response
                                            ├─ status in errorSchema → parse body → kind:'http'
                                            ├─ Zod fails on (success|errorSchema) body → kind:'validation'
                                            ├─ status NOT in errorSchema → kind:'http-unknown'
                                            └─ no response (network/abort) → kind:'network'
```

All paths land in a single envelope; nothing is thrown. `onError` (telemetry hook) still fires for every error path.

When `result: 'data'` (default): behaviour is **unchanged** except that the `useDiscriminatorResponse` global is now consulted with a deprecation warning (§7).

### 4.2 Files touched

- `packages/builder/src/types/config.mts` — add `result` to `BaseEndpointOptions` and `defaults` to `BuilderConfig`.
- `packages/builder/src/types/builder-instance.mts` — extend `EndpointHandler` return type to switch on `Options['result']`.
- `packages/builder/src/types/envelope.mts` *(new)* — `ResponseEnvelope`, `ResponseMeta`, `EnvelopeError` variants.
- `packages/builder/src/handlers/create-handler.mts` — branch on `options.result`; in envelope mode, never re-throw, build envelope.
- `packages/builder/src/errors/handle-error.mts` — extract a shared classifier (`classifyError`) used by both legacy `handleError` and envelope path.
- `packages/builder/src/errors/guards.mts` *(new)* — `isHttpError`, `isValidationError`, `isNetworkError`, `isUnknownHttpError`.
- `packages/builder/src/index.mts` — export new types and guards.
- README + spec.

No new runtime dependency required.

### 4.3 Type plumbing

`EndpointHandler` becomes:

```ts
export type EndpointHandler<Options extends EndpointOptions> = ((
  params: InferEndpointParams<Options>,
) => Promise<InferEndpointReturn<Options>>) & {
  config: Options
}

type InferEndpointReturn<Options extends EndpointOptions> =
  Options extends { result: 'envelope' }
    ? ResponseEnvelope<
        z.output<Options['responseSchema']>,
        EnvelopeError<Options['errorSchema'] & {}, Options['responseSchema']>
      >
    : Options extends { result: 'data' } | { result?: undefined }
      ? InferDataReturn<Options>   // existing behaviour
      : never
```

The `UseDiscriminator` generic parameter on `BuilderInstance` and `EndpointHandler` is **removed** in v2 (kept as a `never`-defaulted alias for one major to avoid surface churn for type-importers).

---

## 5. @navios/react-query integration

The bridging code calls `endpoint(args)` then `processResponse(result)` and throws on error. Two changes:

### 5.1 Detect envelope mode at the type level

Add a helper:

```ts
type IsEnvelope<E> = E extends EndpointHandler<infer O>
  ? O extends { result: 'envelope' } ? true : false
  : false
```

The query/mutation factories key off this and select between two queryFn shapes.

### 5.2 Envelope-aware query factory

When the endpoint is envelope-mode, the bridge **does not unwrap automatically** in the default flow. Instead, the `data` exposed to React Query is the full envelope. The user can still narrow:

```ts
const userQuery = client.queryFromEndpoint(getUserEndpoint)
// userQuery.use() → { data: ResponseEnvelope<User, ...> | undefined, ... }

function UserView({ id }: { id: string }) {
  const { data: envelope } = userQuery.use({ urlParams: { id } })
  if (!envelope) return <Spinner />
  if (envelope.error) return <Err err={envelope.error} />
  return <p>{envelope.data.name} (etag {envelope.response.headers.get('etag')})</p>
}
```

For users who want the **classic semantics** (RQ's `error` populated, `data` is the body), opt into auto-unwrap:

```ts
const userQuery = client.queryFromEndpoint(getUserEndpoint, {
  unwrap: 'throw-on-error',   // default for envelope endpoints? see §5.5
})
// userQuery.use() → { data: User | undefined, error: EnvelopeError | null, ... }
```

`unwrap: 'throw-on-error'` translates the envelope back to RQ's native error channel by throwing the `error` from the queryFn. RQ catches it, populates `error`, leaves `data` undefined. The thrown value is the typed `EnvelopeError`, so `error` is properly typed (we use the third generic of TanStack Query's options).

### 5.3 processResponse becomes optional everywhere

`processResponse` defaults to identity. The hundred `processResponse: (data) => data` lines in the spec/examples go away. When present, it composes after envelope construction:

- In `result: 'data'` mode: `processResponse(parsed)` — same as today.
- In `result: 'envelope'` mode with `unwrap: 'none'` (default for new envelope users): `processResponse(envelope)`.
- In `result: 'envelope'` mode with `unwrap: 'throw-on-error'`: `processResponse(envelope.data)` only on success path.

### 5.4 Mutations and infinite queries

Mutations: identical treatment. `mutate({ ... })` resolves to envelope when in envelope mode; `mutateAsync` returns it. RQ's `error` channel only fires when `unwrap: 'throw-on-error'`.

Infinite queries: the body inside `data.pages[i]` is the envelope by default. `getNextPageParam(lastPage)` now receives the envelope, so users access `lastPage.data.nextCursor`. This is a small ergonomic step-down for paginated APIs; we mitigate with an `unwrap: 'pages'` option that unwraps each page's `.data` and re-throws if any page errored.

### 5.5 Default for `unwrap`

**Recommendation:** default `unwrap: 'none'` when `result: 'envelope'` — the user explicitly opted into envelope mode, they likely want the envelope. Document `unwrap: 'throw-on-error'` prominently for users who want classic RQ semantics + headers/status on success.

### 5.6 Files touched

- `packages/react-query/src/common/types.mts` — `IsEnvelope`, `UnwrapMode`, type computers updated.
- `packages/react-query/src/query/make-options.mts` — branch on envelope/unwrap; envelope mode never throws unless `unwrap: 'throw-on-error'`.
- `packages/react-query/src/query/make-infinite-options.mts` — same, plus `unwrap: 'pages'` handling.
- `packages/react-query/src/mutation/make-hook.mts` — same.
- `packages/react-query/src/client/declare-client.mts` — surface `unwrap` option on all five `xxx` and `xxxFromEndpoint` methods; thread through.
- `packages/react-query/src/client/types/*.mts` — extend `QueryEndpointConfig` etc. with `unwrap?`.
- Tests + README + spec.

---

## 6. Other improvements (worth bundling)

### 6.1 Drop required `processResponse: (data) => data` boilerplate

Currently every example in the react-query spec passes the identity. Defaulting it to identity removes ~3 lines per endpoint and one source of typos. **No type-safety loss**: the input type is already correctly inferred.

### 6.2 Per-endpoint `validateResponse: false`

Allow skipping `responseSchema.parse(data)` when the consumer trusts the server and wants speed. Useful for high-volume reads.

```ts
declareEndpoint({
  ...,
  responseSchema: UserSchema,  // still used for the TYPE
  validateResponse: false,     // but not for runtime parsing
})
```

Cost: tiny. Saves a Zod parse on every response.

### 6.3 Header / status accessor helpers

Export thin utilities so the common cases don't need direct `Headers` API:

```ts
import { getHeader, getCookie, getRetryAfter } from '@navios/builder'

const etag = getHeader(envelope.response, 'etag')   // string | null
```

### 6.4 `endpoint.toRequestConfig(params)`

Public helper that returns the `AbstractRequestConfig` the endpoint would dispatch — useful for SSR caching, custom dispatchers, and tests, without running validation against the response.

### 6.5 Expose `endpoint` on react-query helpers

Already partly done (e.g. `EndpointHelper`). Make it uniform across `query`, `infiniteQuery`, `mutation`, `multipartMutation` so users can always reach the underlying handler for prefetch outside of React.

### 6.6 Streams + envelope (future)

Out of scope for v1 of this change, but `declareStream({ result: 'envelope' })` is a natural extension: envelope's `data` is `Blob`, `response` carries `Content-Type` and `Content-Length`. Easy follow-up.

---

## 7. Deprecations & migration

### 7.1 Deprecate

- **`builder({ useDiscriminatorResponse: true })`** — superseded by per-endpoint `result: 'envelope'` (when you want both branches) or by `errorSchema` alone (when you still want classic throw-on-unmatched).
  - Behaviour preserved for one major version. Emits a `console.warn` once per builder instance on first call to a `declareXxx`.
- **`__status` injection on parsed error bodies** — replaced by `error.status` in the envelope. The legacy path still injects `__status` when both `useDiscriminatorResponse: true` and `errorSchema` are set and `result` is not `'envelope'`. Removed in next major.
- **`isErrorStatus` / `isErrorResponse`** — aliased to new guards (`isHttpError`, etc.). Keep one major.
- **Required `processResponse: (data) => data`** — make optional. No behavioural change for users who keep passing it.
- **Builder generic `UseDiscriminator`** — kept as a phantom type for source-compat, defaulted to `never`. Removed in next major.

### 7.2 Migration

For most users:
```ts
// Before
const api = builder({ useDiscriminatorResponse: true })
const getUser = api.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: UserSchema,
  errorSchema: { 404: NotFoundSchema },
})
const result = await getUser({ urlParams: { id: '1' } })
if (isErrorStatus(result, 404)) { ... } else { result.name }

// After
const api = builder()  // no global flag needed
const getUser = api.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: UserSchema,
  errorSchema: { 404: NotFoundSchema },
  result: 'envelope',
})
const { data, error, response } = await getUser({ urlParams: { id: '1' } })
if (isHttpError(error, 404)) { ... } else if (!error) { data.name }
```

A codemod is feasible for the common case but not strictly necessary — both APIs coexist for one major.

### 7.3 Versioning

- `@navios/builder` → 2.0.0 (drops `UseDiscriminator` generic; ships envelope; emits deprecation warnings; keeps runtime back-compat for one major).
- `@navios/react-query` → 1.0.0 (drops required `processResponse`; ships envelope-aware bridge; minor type-narrowing changes).

---

## 8. Risks & open trade-offs

1. **`data: null` when `error` is set vs. exclusively-tagged union.** I chose to keep `data` and `error` both as fields with `null` on the opposite side, because destructuring is ergonomic. Strict TS users could prefer `{ ok: true, data } | { ok: false, error }` only. The `ok` discriminant gives them that anyway.
2. **Headers as `Headers` vs. plain object.** `Headers` is the source of truth from Fetch, but is not JSON-serializable. For SSR/RSC hydration, react-query's serializer must be configured. Mitigation: helper `serializeResponseMeta` for users who store envelopes in caches.
3. **TanStack Query `data` containing an "error" envelope.** From RQ's perspective the query succeeded. Tooling (React Query DevTools) shows the envelope under data. This is consistent with how users currently see discriminated unions and acceptable.
4. **Type-explosion in inference.** Adding `result` as a discriminator slightly grows the type-test space. We must add `*.spec-d.mts` cases for: envelope+errorSchema, envelope+no-errorSchema, data+errorSchema, data+no-errorSchema, defaults override, per-endpoint override.
5. **Infinite query pagination cursor extraction**, see §5.4 — the default UX gets one extra `.data` indirection. The `unwrap: 'pages'` escape hatch is the answer; we document it loudly.
6. **`processResponse` semantics in envelope mode** are arguably surprising (it receives the envelope, not the body). We could disallow `processResponse` together with `result: 'envelope'` and document `select` (RQ's built-in) as the way to project. **Recommendation:** disallow at the type level when `result: 'envelope'` and `unwrap: 'none'`. This nudges users to the right tool.

---

## 9. Build sequence

The implementation lends itself to two PRs landed in order:

1. **`@navios/builder` envelope mode** — new types, classifier, `result` option, guards, tests, deprecation warnings. Backwards-compatible.
2. **`@navios/react-query` envelope bridge** — `unwrap` option, type-level envelope detection, default `processResponse`, tests.

Each PR is independently shippable; the react-query PR depends on the new types from builder.

---

## 10. Testing plan (high level)

- Unit tests for `classifyError` covering all four `EnvelopeError` kinds, including network and abort.
- `*.spec-d.mts` type tests for each combination of `result`, `errorSchema` presence, `validateResponse`, and `processResponse`.
- React Query tests for `unwrap: 'none' | 'throw-on-error' | 'pages'`, success and error paths.
- Backwards-compat test: existing code that uses `useDiscriminatorResponse: true` continues to work unchanged (except for one deprecation warning).
- Integration test against the existing fake adapter for the full path.

---

## 11. Decisions made on the user's behalf (called out for review)

These were judgment calls during the design pass; flag any to revisit:

| # | Decision | Alternatives considered |
|---|----------|-------------------------|
| 1 | `result: 'data' \| 'envelope'` union (not a boolean) | `envelope: true`, `withResponse: true`, separate `declareSafeEndpoint` |
| 2 | Default `unwrap: 'none'` for envelope endpoints in react-query | Default to `'throw-on-error'` to match classic RQ behaviour |
| 3 | Disallow `processResponse` + envelope + `unwrap: 'none'` together (type-level) | Allow it; let it transform the envelope |
| 4 | Use `Headers` (native) in `response.headers`, not a plain object | Convert to `Record<string, string>` for serializability |
| 5 | Keep `data` and `error` both present (with `null` on opposite branch) | Strict `{ ok: true, data } \| { ok: false, error }` |
| 6 | Deprecate `useDiscriminatorResponse` (keep for one major) | Remove immediately in v2; or keep indefinitely |
| 7 | Deprecate `__status` injection, replace with `error.status` | Keep it for parity with errorSchema users |
| 8 | Bump builder to v2, react-query to v1 | Stay in v1.x for builder if back-compat holds |
| 9 | Streams get envelope support in a follow-up, not this PR | Bundle it now |
| 10 | New error guards (`isHttpError`, `isValidationError`, `isNetworkError`, `isUnknownHttpError`) replace `isErrorStatus` / `isErrorResponse` | Keep the old names; add the new only |

---

## 12. Out of scope (mentioned for completeness)

- Renaming `declareEndpoint` / etc. Despite the verbosity, the names are entrenched in user code and docs; no rename in this round.
- Socket / SSE envelope equivalent. Possible follow-up; not blocking.
- Server-side handler envelope ergonomics (the `RequestArgs` server path noted in CHANGELOG v1.0.0-alpha.2). Separate concern.
