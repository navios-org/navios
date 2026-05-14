# Response Envelope Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-endpoint `result: 'envelope'` mode to `@navios/builder` that returns `{ ok, data, error, response }` without throwing, then teach `@navios/react-query` to bridge it through TanStack Query.

**Architecture:** Phase 1 lands envelope support in the builder behind a new `result` option, with a tagged-union `EnvelopeError`, new type guards, a shared `classifyError` classifier, and a deprecation warning for `useDiscriminatorResponse`. Phase 2 teaches the react-query bridge to detect envelope endpoints, makes `processResponse` optional, and adds an `unwrap` option (`'none' | 'throw-on-error' | 'pages'`).

**Tech Stack:** TypeScript 5+, Zod v4, Vitest (`*.spec.mts` runtime, `*.spec-d.mts` type tests), TanStack Query v5, Yarn + Turbo.

**Design doc:** [`docs/plans/2026-05-14-builder-response-envelope-design.md`](./2026-05-14-builder-response-envelope-design.md). Read it first; it explains every choice. The numbered decisions in §11 of the design are referenced throughout this plan.

**Conventions to obey** (from `CLAUDE.md`):
- `yarn` not `npm`; `yarn turbo run <script> --filter=<package>` for per-package commands.
- All TS source files are `.mts`. Unit tests `*.spec.mts`. Type tests `*.spec-d.mts`.
- No semicolons, single quotes, Oxlint.
- Frequent commits: each task ends with a commit.
- Run `yarn turbo run lint --filter=<package>` after edits to that package.

**Branch/worktree:** Create a feature branch off `main`: `feat/builder-response-envelope`. Optionally use a worktree (`@superpowers:using-git-worktrees`). Both PRs land on this branch in two commits-series; we can split at the end if desired.

---

## Phase 1 — `@navios/builder` envelope mode

### Task 1: Add envelope types

**Files:**
- Create: `packages/builder/src/types/envelope.mts`
- Create: `packages/builder/src/types/envelope.spec-d.mts`
- Modify: `packages/builder/src/types/index.mts` (add export)

**Step 1: Type test first**

Create `packages/builder/src/types/envelope.spec-d.mts`:

```ts
import { expectTypeOf, test } from 'vitest'

import type { ResponseEnvelope, ResponseEnvelopeErr, ResponseEnvelopeOk, ResponseMeta } from './envelope.mjs'

interface User { id: string; name: string }
interface ApiError { code: string; message: string }

test('ResponseMeta has status, statusText, headers', () => {
  expectTypeOf<ResponseMeta>().toEqualTypeOf<{
    status: number
    statusText: string
    headers: Headers
  }>()
})

test('ResponseEnvelopeOk discriminator narrows data', () => {
  const env = {} as ResponseEnvelope<User, ApiError>
  if (env.ok) {
    expectTypeOf(env.data).toEqualTypeOf<User>()
    expectTypeOf(env.error).toEqualTypeOf<null>()
    expectTypeOf(env.response).toEqualTypeOf<ResponseMeta>()
  } else {
    expectTypeOf(env.data).toEqualTypeOf<null>()
    expectTypeOf(env.error).toEqualTypeOf<ApiError>()
    expectTypeOf(env.response).toEqualTypeOf<ResponseMeta | null>()
  }
})

test('Destructuring narrowing via error null check', () => {
  const env = {} as ResponseEnvelope<User, ApiError>
  const { data, error } = env
  if (error) {
    expectTypeOf(error).toEqualTypeOf<ApiError>()
  } else {
    expectTypeOf(data).toEqualTypeOf<User>()
  }
})

test('Branches are exported individually', () => {
  expectTypeOf<ResponseEnvelopeOk<User>>().toMatchTypeOf<ResponseEnvelope<User, never>>()
  expectTypeOf<ResponseEnvelopeErr<ApiError>>().toMatchTypeOf<ResponseEnvelope<never, ApiError>>()
})
```

**Step 2: Run — expect failure**

```bash
yarn turbo run test:ci --filter=@navios/builder
```

Expect: `Cannot find module './envelope.mjs'`.

**Step 3: Implement envelope types**

Create `packages/builder/src/types/envelope.mts`:

```ts
/**
 * Metadata about an HTTP response. Always present on successful envelopes;
 * may be null on error envelopes that represent a network or pre-flight failure
 * where no response was received.
 */
export interface ResponseMeta {
  status: number
  statusText: string
  headers: Headers
}

export interface ResponseEnvelopeOk<TData> {
  readonly ok: true
  readonly data: TData
  readonly error: null
  readonly response: ResponseMeta
}

export interface ResponseEnvelopeErr<TError> {
  readonly ok: false
  readonly data: null
  readonly error: TError
  readonly response: ResponseMeta | null
}

/**
 * Discriminated union of success and error envelopes for endpoints declared
 * with `result: 'envelope'`. Use `ok` or check `error` for null to narrow.
 */
export type ResponseEnvelope<TData, TError> =
  | ResponseEnvelopeOk<TData>
  | ResponseEnvelopeErr<TError>
```

**Step 4: Wire export**

In `packages/builder/src/types/index.mts` add:

```ts
export * from './envelope.mjs'
```

**Step 5: Verify**

```bash
yarn turbo run test:ci --filter=@navios/builder
yarn turbo run lint --filter=@navios/builder
```

**Step 6: Commit**

```bash
git add packages/builder/src/types/envelope.mts packages/builder/src/types/envelope.spec-d.mts packages/builder/src/types/index.mts
git commit -m "feat(builder): add ResponseEnvelope and ResponseMeta types"
```

---

### Task 2: Add `EnvelopeError` tagged-union types

**Files:**
- Create: `packages/builder/src/types/envelope-error.mts`
- Create: `packages/builder/src/types/envelope-error.spec-d.mts`
- Modify: `packages/builder/src/types/index.mts`

**Step 1: Type test**

Create `packages/builder/src/types/envelope-error.spec-d.mts`:

```ts
import { expectTypeOf, test } from 'vitest'

import { z } from 'zod/v4'

import type {
  EnvelopeError,
  HttpErrorVariant,
  NetworkErrorVariant,
  UnknownHttpErrorVariant,
  ValidationErrorVariant,
} from './envelope-error.mjs'

const errorSchema = {
  404: z.object({ kind: z.literal('not_found') }),
  401: z.object({ kind: z.literal('unauthorized'), retryAfter: z.number() }),
}

type E = EnvelopeError<typeof errorSchema>

test('EnvelopeError union covers four kinds', () => {
  const e = {} as E
  if (e.kind === 'http') {
    expectTypeOf(e.status).toEqualTypeOf<404 | 401>()
  } else if (e.kind === 'http-unknown') {
    expectTypeOf(e.status).toEqualTypeOf<number>()
    expectTypeOf(e.body).toEqualTypeOf<unknown>()
  } else if (e.kind === 'validation') {
    expectTypeOf(e.status).toEqualTypeOf<number>()
  } else {
    expectTypeOf(e.kind).toEqualTypeOf<'network'>()
  }
})

test('HttpErrorVariant.status narrows body', () => {
  const v = {} as HttpErrorVariant<typeof errorSchema>
  if (v.status === 404) {
    expectTypeOf(v.body).toEqualTypeOf<{ kind: 'not_found' }>()
  } else {
    expectTypeOf(v.status).toEqualTypeOf<401>()
    expectTypeOf(v.body).toEqualTypeOf<{ kind: 'unauthorized'; retryAfter: number }>()
  }
})

test('Variant types exist standalone', () => {
  expectTypeOf<UnknownHttpErrorVariant>().toHaveProperty('kind')
  expectTypeOf<ValidationErrorVariant>().toHaveProperty('issues')
  expectTypeOf<NetworkErrorVariant>().toHaveProperty('cause')
})
```

**Step 2: Implement**

Create `packages/builder/src/types/envelope-error.mts`:

```ts
import type { z, $ZodIssue } from 'zod/v4/core'

import type { ErrorSchemaRecord } from './error-schema.mjs'

export interface HttpErrorVariant<E extends ErrorSchemaRecord = ErrorSchemaRecord> {
  readonly kind: 'http'
  readonly status: keyof E & number
  readonly body: { [K in keyof E]: z.output<E[K]> & { readonly status: K & number } }[keyof E]
}

export interface UnknownHttpErrorVariant {
  readonly kind: 'http-unknown'
  readonly status: number
  readonly body: unknown
}

export interface ValidationErrorVariant {
  readonly kind: 'validation'
  readonly status: number
  readonly issues: readonly $ZodIssue[]
  readonly body: unknown
}

export interface NetworkErrorVariant {
  readonly kind: 'network'
  readonly cause: unknown
}

export type EnvelopeError<E extends ErrorSchemaRecord | undefined = undefined> =
  | (E extends ErrorSchemaRecord ? HttpErrorVariant<E> : never)
  | UnknownHttpErrorVariant
  | ValidationErrorVariant
  | NetworkErrorVariant
```

Note: We inject `status: K` into the **body** of `HttpErrorVariant` so `error.body.status` is also discriminating, but we keep the outer `status` for fast checks. This replaces the `__status` mutation; we now annotate at the type level only — the runtime body is untouched.

**Step 3: Export & verify**

Add `export * from './envelope-error.mjs'` to `packages/builder/src/types/index.mts`.

```bash
yarn turbo run test:ci --filter=@navios/builder
yarn turbo run lint --filter=@navios/builder
```

**Step 4: Commit**

```bash
git add packages/builder/src/types/envelope-error.mts packages/builder/src/types/envelope-error.spec-d.mts packages/builder/src/types/index.mts
git commit -m "feat(builder): add EnvelopeError tagged-union with http/http-unknown/validation/network variants"
```

---

### Task 3: Add error type guards

**Files:**
- Create: `packages/builder/src/errors/guards.mts`
- Create: `packages/builder/src/errors/guards.spec.mts`
- Create: `packages/builder/src/errors/guards.spec-d.mts`
- Modify: `packages/builder/src/errors/index.mts`

**Step 1: Runtime test**

Create `packages/builder/src/errors/guards.spec.mts`:

```ts
import { describe, expect, it } from 'vitest'

import { isHttpError, isNetworkError, isUnknownHttpError, isValidationError } from './guards.mjs'

describe('envelope error guards', () => {
  it('isHttpError narrows by kind and status', () => {
    const e = { kind: 'http', status: 404, body: { kind: 'not_found' } } as const
    expect(isHttpError(e)).toBe(true)
    expect(isHttpError(e, 404)).toBe(true)
    expect(isHttpError(e, 500)).toBe(false)
  })

  it('isHttpError returns false for other kinds', () => {
    expect(isHttpError({ kind: 'network', cause: new Error('x') } as const)).toBe(false)
  })

  it('isUnknownHttpError narrows', () => {
    expect(isUnknownHttpError({ kind: 'http-unknown', status: 502, body: 'Bad Gateway' })).toBe(true)
    expect(isUnknownHttpError({ kind: 'http', status: 404, body: {} } as const)).toBe(false)
  })

  it('isValidationError narrows', () => {
    expect(isValidationError({ kind: 'validation', status: 200, issues: [], body: {} })).toBe(true)
  })

  it('isNetworkError narrows', () => {
    expect(isNetworkError({ kind: 'network', cause: new Error('timeout') })).toBe(true)
  })

  it('guards are null/undefined safe', () => {
    expect(isHttpError(null)).toBe(false)
    expect(isHttpError(undefined)).toBe(false)
    expect(isHttpError('string')).toBe(false)
  })
})
```

**Step 2: Type test**

Create `packages/builder/src/errors/guards.spec-d.mts`:

```ts
import { expectTypeOf, test } from 'vitest'

import { z } from 'zod/v4'

import type { EnvelopeError } from '../types/envelope-error.mjs'

import { isHttpError } from './guards.mjs'

const errorSchema = {
  404: z.object({ kind: z.literal('not_found') }),
  401: z.object({ kind: z.literal('unauthorized') }),
}

test('isHttpError(e) narrows to HttpErrorVariant', () => {
  const e = {} as EnvelopeError<typeof errorSchema>
  if (isHttpError(e)) {
    expectTypeOf(e.kind).toEqualTypeOf<'http'>()
    expectTypeOf(e.status).toEqualTypeOf<404 | 401>()
  }
})

test('isHttpError(e, 404) narrows to the 404 body', () => {
  const e = {} as EnvelopeError<typeof errorSchema>
  if (isHttpError(e, 404)) {
    expectTypeOf(e.status).toEqualTypeOf<404>()
    expectTypeOf(e.body).toMatchTypeOf<{ kind: 'not_found' }>()
  }
})
```

**Step 3: Implement guards**

Create `packages/builder/src/errors/guards.mts`:

```ts
import type {
  EnvelopeError,
  HttpErrorVariant,
  NetworkErrorVariant,
  UnknownHttpErrorVariant,
  ValidationErrorVariant,
} from '../types/envelope-error.mjs'
import type { ErrorSchemaRecord } from '../types/error-schema.mjs'

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export function isHttpError<E extends ErrorSchemaRecord = ErrorSchemaRecord, S extends keyof E & number = keyof E & number>(
  error: unknown,
  status?: S,
): error is Extract<HttpErrorVariant<E>, { status: S }> {
  if (!isObj(error) || error.kind !== 'http') return false
  return status === undefined ? true : error.status === status
}

export function isUnknownHttpError(error: unknown): error is UnknownHttpErrorVariant {
  return isObj(error) && error.kind === 'http-unknown'
}

export function isValidationError(error: unknown): error is ValidationErrorVariant {
  return isObj(error) && error.kind === 'validation'
}

export function isNetworkError(error: unknown): error is NetworkErrorVariant {
  return isObj(error) && error.kind === 'network'
}

export function isEnvelopeError(error: unknown): error is EnvelopeError {
  return isHttpError(error) || isUnknownHttpError(error) || isValidationError(error) || isNetworkError(error)
}
```

**Step 4: Wire export**

In `packages/builder/src/errors/index.mts` add `export * from './guards.mjs'`.

**Step 5: Run & commit**

```bash
yarn turbo run test:ci --filter=@navios/builder
yarn turbo run lint --filter=@navios/builder
git add packages/builder/src/errors/guards.mts packages/builder/src/errors/guards.spec.mts packages/builder/src/errors/guards.spec-d.mts packages/builder/src/errors/index.mts
git commit -m "feat(builder): add envelope error type guards (isHttpError, isValidationError, isNetworkError, isUnknownHttpError)"
```

---

### Task 4: Extract `classifyError` from the legacy `handleError`

The shared classifier examines an unknown error (typically a `NaviosError`) and returns an `EnvelopeError`. Both the legacy `handleError` path and the new envelope path will call it.

**Files:**
- Create: `packages/builder/src/errors/classify-error.mts`
- Create: `packages/builder/src/errors/classify-error.spec.mts`

**Step 1: Tests**

Create `packages/builder/src/errors/classify-error.spec.mts`:

```ts
import { describe, expect, it } from 'vitest'

import { z } from 'zod/v4'

import { classifyError } from './classify-error.mjs'

describe('classifyError', () => {
  it('returns http variant for matched errorSchema entry', () => {
    const schema = { 404: z.object({ msg: z.string() }) }
    const error = {
      response: {
        data: { msg: 'not found' },
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
      },
    }
    const result = classifyError(error, schema)
    expect(result.kind).toBe('http')
    if (result.kind === 'http') {
      expect(result.status).toBe(404)
      expect(result.body).toEqual({ msg: 'not found', status: 404 })
    }
  })

  it('returns http-unknown for unmatched status', () => {
    const schema = { 404: z.object({ msg: z.string() }) }
    const error = {
      response: { data: 'ouch', status: 500, statusText: 'Server Error', headers: new Headers() },
    }
    const result = classifyError(error, schema)
    expect(result.kind).toBe('http-unknown')
    if (result.kind === 'http-unknown') {
      expect(result.status).toBe(500)
      expect(result.body).toBe('ouch')
    }
  })

  it('returns http-unknown when no errorSchema is provided', () => {
    const error = {
      response: { data: { x: 1 }, status: 418, statusText: 'Teapot', headers: new Headers() },
    }
    const result = classifyError(error, undefined)
    expect(result.kind).toBe('http-unknown')
  })

  it('returns validation when matched schema fails to parse', () => {
    const schema = { 400: z.object({ msg: z.string() }) }
    const error = {
      response: { data: { msg: 42 }, status: 400, statusText: 'Bad', headers: new Headers() },
    }
    const result = classifyError(error, schema)
    expect(result.kind).toBe('validation')
    if (result.kind === 'validation') {
      expect(result.status).toBe(400)
      expect(result.issues.length).toBeGreaterThan(0)
    }
  })

  it('returns network when error has no response', () => {
    const result = classifyError(new TypeError('Failed to fetch'), undefined)
    expect(result.kind).toBe('network')
  })

  it('returns network for AbortError (signal aborted)', () => {
    const abort = new DOMException('aborted', 'AbortError')
    const result = classifyError(abort, undefined)
    expect(result.kind).toBe('network')
  })
})
```

**Step 2: Implement**

Create `packages/builder/src/errors/classify-error.mts`:

```ts
import { ZodError, type ZodType } from 'zod/v4'

import type { AbstractResponse } from '../types/common.mjs'
import type { EnvelopeError } from '../types/envelope-error.mjs'
import type { ErrorSchemaRecord } from '../types/error-schema.mjs'

function getResponse(error: unknown): AbstractResponse<unknown> | null {
  if (typeof error !== 'object' || error === null) return null
  if (!('response' in error) || !error.response) return null
  return error.response as AbstractResponse<unknown>
}

/**
 * Classify an unknown error into an EnvelopeError variant.
 *
 * - HTTP error with response.status in errorSchema -> 'http'
 * - HTTP error whose matched schema fails Zod parse -> 'validation'
 * - HTTP error with response but no matching schema -> 'http-unknown'
 * - No response at all -> 'network'
 *
 * @param error The thrown value (usually a NaviosError)
 * @param errorSchema Optional per-status schemas; when omitted, all HTTP errors fall through to 'http-unknown'
 */
export function classifyError(
  error: unknown,
  errorSchema: ErrorSchemaRecord | undefined,
): EnvelopeError {
  const response = getResponse(error)
  if (!response) {
    return { kind: 'network', cause: error }
  }

  const status = response.status
  const schema = errorSchema?.[status] as ZodType | undefined

  if (schema) {
    try {
      const parsed = schema.parse(response.data) as Record<string, unknown>
      return {
        kind: 'http',
        status,
        // status is injected for body-level discrimination; the field is read-only
        body: Object.freeze({ ...parsed, status }) as never,
      }
    } catch (zerr) {
      if (zerr instanceof ZodError) {
        return { kind: 'validation', status, issues: zerr.issues, body: response.data }
      }
      throw zerr
    }
  }

  return { kind: 'http-unknown', status, body: response.data }
}
```

**Step 3: Run & commit**

```bash
yarn turbo run test:ci --filter=@navios/builder
yarn turbo run lint --filter=@navios/builder
git add packages/builder/src/errors/classify-error.mts packages/builder/src/errors/classify-error.spec.mts
git commit -m "feat(builder): add classifyError shared classifier for envelope errors"
```

---

### Task 5: Add `result`, `validateResponse`, `defaults` config fields (types only)

**Files:**
- Modify: `packages/builder/src/types/config.mts`
- Create: `packages/builder/src/types/config.spec-d.mts`

**Step 1: Type test**

Create `packages/builder/src/types/config.spec-d.mts`:

```ts
import { expectTypeOf, test } from 'vitest'

import type { BaseEndpointOptions, BuilderConfig } from './config.mjs'

test('BaseEndpointOptions.result accepts data | envelope', () => {
  const a = { method: 'GET', url: '/u', result: 'data' } satisfies BaseEndpointOptions
  const b = { method: 'GET', url: '/u', result: 'envelope' } satisfies BaseEndpointOptions
  expectTypeOf(a.result).toEqualTypeOf<'data' | 'envelope' | undefined>()
  expectTypeOf(b.result).toEqualTypeOf<'data' | 'envelope' | undefined>()
})

test('BaseEndpointOptions.validateResponse accepts boolean', () => {
  const a = { method: 'GET', url: '/u', validateResponse: false } satisfies BaseEndpointOptions
  expectTypeOf(a.validateResponse).toEqualTypeOf<boolean | undefined>()
})

test('BuilderConfig.defaults.result configures default mode', () => {
  const c: BuilderConfig = { defaults: { result: 'envelope' } }
  expectTypeOf(c.defaults).toEqualTypeOf<{ result?: 'data' | 'envelope' } | undefined>()
})
```

**Step 2: Modify `config.mts`**

In `packages/builder/src/types/config.mts`, extend `BaseEndpointOptions`:

```ts
export interface BaseEndpointOptions {
  // ... existing fields ...

  /**
   * Output mode for this endpoint.
   * - 'data' (default): returns parsed body; throws on error (current behavior).
   * - 'envelope': returns { ok, data, error, response } and never throws. Errors are
   *   classified into typed variants; access status/headers via `response`.
   */
  result?: 'data' | 'envelope'

  /**
   * When false, skip `responseSchema.parse()` at runtime. The static type is still
   * inferred from `responseSchema`. Useful for high-volume reads against a trusted server.
   * @default true
   */
  validateResponse?: boolean
}
```

And extend `BuilderConfig` (keep `useDiscriminatorResponse` for now; deprecation comes later):

```ts
export interface BuilderConfig<UseDiscriminator extends boolean = false> {
  // ... existing fields ...

  /** Default behaviour applied to every endpoint declaration unless overridden per-endpoint. */
  defaults?: {
    /** Default result mode; per-endpoint `result` overrides. */
    result?: 'data' | 'envelope'
  }
}
```

**Step 3: Run & commit**

```bash
yarn turbo run test:ci --filter=@navios/builder
yarn turbo run lint --filter=@navios/builder
git add packages/builder/src/types/config.mts packages/builder/src/types/config.spec-d.mts
git commit -m "feat(builder): add result / validateResponse options and defaults config (types only)"
```

---

### Task 6: Branch `InferEndpointReturn` on `result`

**Files:**
- Modify: `packages/builder/src/types/builder-instance.mts`
- Create: `packages/builder/src/types/builder-instance.spec-d.mts`

**Step 1: Type test**

Create `packages/builder/src/types/builder-instance.spec-d.mts`:

```ts
import { expectTypeOf, test } from 'vitest'

import { z } from 'zod/v4'

import type { EndpointHandler } from './builder-instance.mjs'

const dataOptions = {
  method: 'GET',
  url: '/u',
  responseSchema: z.object({ name: z.string() }),
} as const

const envelopeOptions = {
  method: 'GET',
  url: '/u',
  responseSchema: z.object({ name: z.string() }),
  errorSchema: { 404: z.object({ msg: z.string() }) },
  result: 'envelope',
} as const

test("result: 'data' (or omitted) returns parsed body", () => {
  type R = Awaited<ReturnType<EndpointHandler<typeof dataOptions, false>>>
  expectTypeOf<R>().toEqualTypeOf<{ name: string }>()
})

test("result: 'envelope' returns ResponseEnvelope", () => {
  type R = Awaited<ReturnType<EndpointHandler<typeof envelopeOptions, false>>>
  // R should be ResponseEnvelope<{ name: string }, EnvelopeError<typeof errorSchema>>
  const r = {} as R
  if (r.ok) {
    expectTypeOf(r.data).toMatchTypeOf<{ name: string }>()
  } else {
    expectTypeOf(r.error.kind).toEqualTypeOf<'http' | 'http-unknown' | 'validation' | 'network'>()
  }
})
```

**Step 2: Modify `InferEndpointReturn`**

In `packages/builder/src/types/builder-instance.mts`, replace the existing `InferEndpointReturn` block:

```ts
import type { ResponseEnvelope } from './envelope.mjs'
import type { EnvelopeError } from './envelope-error.mjs'

export type InferEndpointReturn<
  Options extends EndpointOptions,
  UseDiscriminator extends boolean,
> = Options extends { result: 'envelope' }
  ? ResponseEnvelope<
      z.output<Options['responseSchema']>,
      EnvelopeError<Options['errorSchema'] extends ErrorSchemaRecord ? Options['errorSchema'] : undefined>
    >
  : UseDiscriminator extends true
    ? Options['errorSchema'] extends ErrorSchemaRecord
      ? z.output<Options['responseSchema']> | InferErrorSchemaOutputWithStatus<Options['errorSchema']>
      : z.output<Options['responseSchema']>
    : z.output<Options['responseSchema']>
```

Do the equivalent for `InferStreamReturn` (envelope wraps `Blob`).

**Step 3: Run & commit**

```bash
yarn turbo run test:ci --filter=@navios/builder
yarn turbo run lint --filter=@navios/builder
git add packages/builder/src/types/builder-instance.mts packages/builder/src/types/builder-instance.spec-d.mts
git commit -m "feat(builder): branch InferEndpointReturn / InferStreamReturn on result mode"
```

---

### Task 7: Runtime — envelope path in `createHandler`

This is the heart of Phase 1.

**Files:**
- Modify: `packages/builder/src/handlers/create-handler.mts`
- Create: `packages/builder/src/handlers/__tests__/envelope.spec.mts`

**Step 1: Runtime tests**

Create `packages/builder/src/handlers/__tests__/envelope.spec.mts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { z } from 'zod/v4'

import { builder } from '../../builder.mjs'
import { isHttpError, isNetworkError, isValidationError } from '../../errors/guards.mjs'

import type { Client } from '../../types/common.mjs'

const userSchema = z.object({ id: z.string(), name: z.string() })
const notFoundSchema = z.object({ msg: z.literal('not found') })

function mockClient(impl: () => Promise<unknown>): Client {
  return { request: vi.fn().mockImplementation(impl) }
}

describe("declareEndpoint with result: 'envelope'", () => {
  it('returns ok envelope on success', async () => {
    const api = builder()
    api.provideClient(mockClient(() => Promise.resolve({
      data: { id: '1', name: 'A' },
      status: 200,
      statusText: 'OK',
      headers: new Headers({ etag: 'abc' }),
    })))

    const getUser = api.declareEndpoint({
      method: 'GET',
      url: '/u',
      responseSchema: userSchema,
      result: 'envelope',
    })

    const env = await getUser({})
    expect(env.ok).toBe(true)
    if (env.ok) {
      expect(env.data).toEqual({ id: '1', name: 'A' })
      expect(env.error).toBeNull()
      expect(env.response.status).toBe(200)
      expect(env.response.headers.get('etag')).toBe('abc')
    }
  })

  it('returns http error variant for matched errorSchema entry', async () => {
    const api = builder()
    api.provideClient(mockClient(() => Promise.reject({
      response: { data: { msg: 'not found' }, status: 404, statusText: 'NF', headers: new Headers() },
    })))

    const getUser = api.declareEndpoint({
      method: 'GET',
      url: '/u',
      responseSchema: userSchema,
      errorSchema: { 404: notFoundSchema },
      result: 'envelope',
    })

    const env = await getUser({})
    expect(env.ok).toBe(false)
    if (!env.ok) {
      expect(isHttpError(env.error, 404)).toBe(true)
      if (isHttpError(env.error, 404)) {
        expect(env.error.body).toMatchObject({ msg: 'not found', status: 404 })
      }
      expect(env.response?.status).toBe(404)
    }
  })

  it('returns http-unknown for unmatched status', async () => {
    const api = builder()
    api.provideClient(mockClient(() => Promise.reject({
      response: { data: 'oops', status: 500, statusText: 'SE', headers: new Headers() },
    })))
    const getUser = api.declareEndpoint({
      method: 'GET',
      url: '/u',
      responseSchema: userSchema,
      errorSchema: { 404: notFoundSchema },
      result: 'envelope',
    })
    const env = await getUser({})
    expect(env.ok).toBe(false)
    if (!env.ok) expect(env.error.kind).toBe('http-unknown')
  })

  it('returns validation variant for Zod success-body parse failure', async () => {
    const api = builder()
    api.provideClient(mockClient(() => Promise.resolve({
      data: { id: 1, name: 'A' }, // id should be string
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
    })))
    const getUser = api.declareEndpoint({
      method: 'GET',
      url: '/u',
      responseSchema: userSchema,
      result: 'envelope',
    })
    const env = await getUser({})
    expect(env.ok).toBe(false)
    if (!env.ok) expect(isValidationError(env.error)).toBe(true)
  })

  it('returns network variant when no response is present', async () => {
    const api = builder()
    api.provideClient(mockClient(() => Promise.reject(new TypeError('fetch failed'))))
    const getUser = api.declareEndpoint({
      method: 'GET',
      url: '/u',
      responseSchema: userSchema,
      result: 'envelope',
    })
    const env = await getUser({})
    expect(env.ok).toBe(false)
    if (!env.ok) expect(isNetworkError(env.error)).toBe(true)
  })

  it("respects builder defaults.result when per-endpoint not set", async () => {
    const api = builder({ defaults: { result: 'envelope' } })
    api.provideClient(mockClient(() => Promise.resolve({
      data: { id: '1', name: 'A' }, status: 200, statusText: 'OK', headers: new Headers(),
    })))
    const getUser = api.declareEndpoint({ method: 'GET', url: '/u', responseSchema: userSchema })
    const env: any = await getUser({})
    expect(env.ok).toBe(true)
  })

  it("validateResponse: false skips Zod parsing in data mode", async () => {
    const api = builder()
    api.provideClient(mockClient(() => Promise.resolve({
      data: { id: 1, name: 'A' }, status: 200, statusText: 'OK', headers: new Headers(),
    })))
    const getUser = api.declareEndpoint({
      method: 'GET',
      url: '/u',
      responseSchema: userSchema,
      validateResponse: false,
    })
    const result = await getUser({})
    expect(result).toEqual({ id: 1, name: 'A' })
  })
})
```

**Step 2: Modify `createHandler`**

Replace `packages/builder/src/handlers/create-handler.mts` with:

```ts
import type { ZodObject, ZodType } from 'zod/v4'

import { classifyError } from '../errors/classify-error.mjs'
import { handleError } from '../errors/handle-error.mjs'
import { bindUrlParams } from '../request/bind-url-params.mjs'
import { makeConfig } from '../request/make-config.mjs'

import type { ErrorSchemaRecord } from '../types/error-schema.mjs'
import type { ResponseEnvelope, ResponseMeta } from '../types/envelope.mjs'
import type { BuilderContext, EndpointOptions, StreamOptions } from '../types/index.mjs'

export interface HandlerRequest {
  urlParams?: Record<string, string | number>
  params?: Record<string, unknown>
  data?: unknown
  signal?: AbortSignal | null
  headers?: Record<string, string>
  [key: string]: unknown
}

export interface CreateHandlerOptions<Options extends EndpointOptions | StreamOptions> {
  options: Options
  context: BuilderContext
  isMultipart?: boolean
  responseSchema?: ZodType
  errorSchema?: ErrorSchemaRecord
  urlParamsSchema?: ZodObject
  transformRequest?: (request: HandlerRequest) => HandlerRequest
  transformResponse?: (data: unknown) => unknown
}

function toResponseMeta(r: { status: number; statusText: string; headers: Headers | Record<string, string> }): ResponseMeta {
  const headers = r.headers instanceof Headers ? r.headers : new Headers(r.headers)
  return { status: r.status, statusText: r.statusText, headers }
}

export function createHandler<Options extends EndpointOptions | StreamOptions, TResponse>({
  options,
  context: { getClient, config },
  isMultipart = false,
  responseSchema,
  errorSchema,
  urlParamsSchema,
  transformRequest,
  transformResponse,
}: CreateHandlerOptions<Options>) {
  const { method, url } = options
  const resultMode = (options as { result?: 'data' | 'envelope' }).result ?? config.defaults?.result ?? 'data'
  const shouldValidate = (options as { validateResponse?: boolean }).validateResponse !== false

  const handler = async (request: HandlerRequest = {} as HandlerRequest): Promise<TResponse> => {
    const client = getClient()
    const finalUrlPart = bindUrlParams<Options['url']>(url, request, urlParamsSchema)
    const finalRequest = transformRequest ? transformRequest(request) : request

    if (resultMode === 'envelope') {
      try {
        const result = await client.request(
          makeConfig(finalRequest, options, method, finalUrlPart, isMultipart),
        )
        const raw = transformResponse ? transformResponse(result.data) : result.data
        try {
          const data = (shouldValidate && responseSchema) ? responseSchema.parse(raw) : raw
          return {
            ok: true,
            data,
            error: null,
            response: toResponseMeta(result as never),
          } as TResponse
        } catch (zerr) {
          // Validation failed on a successful HTTP response
          const error = classifyError({ response: { ...result, data: raw } }, errorSchema)
          // ^ this would classify as http-unknown if status is 2xx and no schema. Use classifyError on the raw zod-failure synthesized error:
          if (error.kind === 'http-unknown') {
            return {
              ok: false,
              data: null,
              error: { kind: 'validation', status: result.status, issues: (zerr as { issues: never[] }).issues, body: raw },
              response: toResponseMeta(result as never),
            } as TResponse
          }
          return {
            ok: false,
            data: null,
            error,
            response: toResponseMeta(result as never),
          } as TResponse
        }
      } catch (err) {
        if (config.onError) config.onError(err)
        const envError = classifyError(err, errorSchema)
        const resp = (err as { response?: { status: number; statusText: string; headers: Headers | Record<string, string> } }).response
        return {
          ok: false,
          data: null,
          error: envError,
          response: resp ? toResponseMeta(resp) : null,
        } as TResponse
      }
    }

    // Legacy data mode (unchanged behaviour, plus validateResponse opt-out)
    try {
      const result = await client.request(
        makeConfig(finalRequest, options, method, finalUrlPart, isMultipart),
      )
      const data = transformResponse ? transformResponse(result.data) : result.data
      return ((shouldValidate && responseSchema) ? responseSchema.parse(data) : data) as TResponse
    } catch (error) {
      return handleError(config, error, responseSchema, errorSchema) as TResponse
    }
  }

  handler.config = options
  return handler
}
```

Note the slightly awkward two-step for validation-on-success: simplify after re-reading by introducing a small helper if it makes the code cleaner. The point is: any path that does not produce a successful parsed body lands in an `EnvelopeError` of the right kind.

**Step 3: Run**

```bash
yarn turbo run test:ci --filter=@navios/builder
```

All existing tests must still pass (back-compat). New envelope tests must pass.

**Step 4: Lint & commit**

```bash
yarn turbo run lint --filter=@navios/builder
git add packages/builder/src/handlers/create-handler.mts packages/builder/src/handlers/__tests__/envelope.spec.mts
git commit -m "feat(builder): implement envelope mode in createHandler with classified errors"
```

---

### Task 8: Envelope for `declareStream`

Streams need envelope support too (the user wants `Content-Type`, `Content-Length` for downloads).

**Files:**
- Modify: `packages/builder/src/handlers/stream.mts` (verify it threads through `result` from options — likely no change needed since stream uses `createHandler`)
- Add a test in `envelope.spec.mts`:

```ts
it('declareStream with result envelope returns Blob in data', async () => {
  const api = builder()
  const blob = new Blob(['x'])
  api.provideClient({
    request: () => Promise.resolve({
      data: blob, status: 200, statusText: 'OK', headers: new Headers({ 'content-type': 'application/pdf' }),
    }),
  } as never)
  const dl = api.declareStream({ method: 'GET', url: '/d', result: 'envelope' })
  const env = await dl({})
  expect(env.ok).toBe(true)
  if (env.ok) {
    expect(env.data).toBe(blob)
    expect(env.response.headers.get('content-type')).toBe('application/pdf')
  }
})
```

Verify the `InferStreamReturn` change from Task 6 covers this.

**Commit:**

```bash
git add packages/builder/src/handlers/__tests__/envelope.spec.mts
git commit -m "test(builder): cover declareStream envelope mode"
```

---

### Task 9: Header helper utilities

**Files:**
- Create: `packages/builder/src/response/headers.mts`
- Create: `packages/builder/src/response/headers.spec.mts`
- Create: `packages/builder/src/response/index.mts`
- Modify: `packages/builder/src/index.mts`

**Step 1: Tests**

```ts
import { describe, expect, it } from 'vitest'

import { getCookie, getHeader, getRetryAfterMs } from './headers.mjs'

describe('response header helpers', () => {
  it('getHeader returns string or null', () => {
    const meta = { status: 200, statusText: 'OK', headers: new Headers({ etag: 'abc' }) }
    expect(getHeader(meta, 'etag')).toBe('abc')
    expect(getHeader(meta, 'missing')).toBeNull()
    expect(getHeader(null, 'etag')).toBeNull()
  })

  it('getCookie parses set-cookie name', () => {
    const meta = { status: 200, statusText: 'OK', headers: new Headers({ 'set-cookie': 'session=xyz; Path=/' }) }
    expect(getCookie(meta, 'session')).toBe('xyz')
  })

  it('getRetryAfterMs parses seconds and HTTP-date forms', () => {
    const a = { status: 429, statusText: '', headers: new Headers({ 'retry-after': '120' }) }
    expect(getRetryAfterMs(a)).toBe(120_000)
    const future = new Date(Date.now() + 60_000).toUTCString()
    const b = { status: 429, statusText: '', headers: new Headers({ 'retry-after': future }) }
    expect(getRetryAfterMs(b)).toBeGreaterThan(0)
  })
})
```

**Step 2: Implement** (`packages/builder/src/response/headers.mts`):

```ts
import type { ResponseMeta } from '../types/envelope.mjs'

export function getHeader(meta: ResponseMeta | null, name: string): string | null {
  return meta ? meta.headers.get(name) : null
}

export function getCookie(meta: ResponseMeta | null, name: string): string | null {
  const raw = getHeader(meta, 'set-cookie')
  if (!raw) return null
  const prefix = `${name}=`
  for (const entry of raw.split(/,(?=\s*\w+=)/)) {
    const trimmed = entry.trim()
    if (trimmed.startsWith(prefix)) {
      const value = trimmed.slice(prefix.length).split(';')[0]
      return value ?? null
    }
  }
  return null
}

export function getRetryAfterMs(meta: ResponseMeta | null): number | null {
  const raw = getHeader(meta, 'retry-after')
  if (!raw) return null
  const asInt = Number(raw)
  if (Number.isFinite(asInt)) return Math.max(0, asInt * 1000)
  const date = Date.parse(raw)
  if (Number.isFinite(date)) return Math.max(0, date - Date.now())
  return null
}
```

**Step 3: Wire exports**

`packages/builder/src/response/index.mts`:

```ts
export * from './headers.mjs'
```

In `packages/builder/src/index.mts`, add `export * from './response/index.mjs'`.

**Step 4: Run & commit**

```bash
yarn turbo run test:ci --filter=@navios/builder
yarn turbo run lint --filter=@navios/builder
git add packages/builder/src/response/
git commit -m "feat(builder): add getHeader / getCookie / getRetryAfterMs helpers"
```

---

### Task 10: Deprecation warning for `useDiscriminatorResponse`

**Files:**
- Modify: `packages/builder/src/builder.mts`
- Modify: `packages/builder/src/__tests__/builder.spec.mts` (add coverage)

**Step 1: Tests**

Add inside the existing test file:

```ts
it('warns once per builder instance when useDiscriminatorResponse is set', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const api = builder({ useDiscriminatorResponse: true })
  api.declareEndpoint({ method: 'GET', url: '/u', responseSchema: z.object({ name: z.string() }) })
  api.declareEndpoint({ method: 'GET', url: '/v', responseSchema: z.object({ name: z.string() }) })
  expect(warn).toHaveBeenCalledTimes(1)
  expect(warn.mock.calls[0][0]).toMatch(/useDiscriminatorResponse/)
  warn.mockRestore()
})

it('does not warn when only defaults.result is used', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const api = builder({ defaults: { result: 'envelope' } })
  api.declareEndpoint({ method: 'GET', url: '/u', responseSchema: z.object({ name: z.string() }) })
  expect(warn).not.toHaveBeenCalled()
  warn.mockRestore()
})
```

**Step 2: Implement**

In `packages/builder/src/builder.mts`, inside the factory closure, set a `warned` flag and emit on first declarator call:

```ts
let warned = false
function maybeWarn() {
  if (warned) return
  if (config.useDiscriminatorResponse) {
    // eslint-disable-next-line no-console
    console.warn(
      '[@navios/builder] `useDiscriminatorResponse` is deprecated and will be removed in the next major. '
      + "Use per-endpoint `result: 'envelope'` (or `defaults: { result: 'envelope' }`) instead. "
      + 'See docs/plans/2026-05-14-builder-response-envelope-design.md',
    )
  }
  warned = true
}
```

Call `maybeWarn()` at the top of `declareEndpoint`, `declareMultipart`, and `declareStream`.

**Step 3: Run & commit**

```bash
yarn turbo run test:ci --filter=@navios/builder
yarn turbo run lint --filter=@navios/builder
git add packages/builder/src/builder.mts packages/builder/src/__tests__/builder.spec.mts
git commit -m "feat(builder): deprecate useDiscriminatorResponse with one-time warning"
```

---

### Task 11: Alias old guards to new

**Files:**
- Modify: `packages/builder/src/types/error-schema.mts`

**Action:** Add deprecation JSDoc to `isErrorStatus` and `isErrorResponse`. They continue to work on `__status`-bearing values from legacy mode. No behavioural change. Just JSDoc:

```ts
/** @deprecated Use `isHttpError` from `@navios/builder` instead. */
export function isErrorStatus(...) { ... }

/** @deprecated Use `isEnvelopeError` / `isHttpError` from `@navios/builder` instead. */
export function isErrorResponse(...) { ... }
```

Commit:

```bash
git add packages/builder/src/types/error-schema.mts
git commit -m "docs(builder): mark isErrorStatus / isErrorResponse deprecated"
```

---

### Task 12: Update README + CHANGELOG + spec for builder

**Files:**
- Modify: `packages/builder/README.md`
- Modify: `packages/builder/CHANGELOG.md`
- Modify: `specs/navios-builder.md`

**Action:** Add a new top-level section in the README titled "Envelope mode (`result: 'envelope'`)" with:
- The full envelope shape.
- A migration example from `useDiscriminatorResponse: true` + `errorSchema`.
- The four error variants and the new guards.
- `validateResponse: false` and header helpers.

CHANGELOG: add a `## [2.0.0-alpha.1]` block summarizing changes; mark `useDiscriminatorResponse`, `isErrorStatus`, `isErrorResponse`, `__status` as deprecated.

Spec: add the new section under "Advanced Usage" mirroring the README.

```bash
git add packages/builder/README.md packages/builder/CHANGELOG.md specs/navios-builder.md
git commit -m "docs(builder): document envelope mode, helpers, and deprecations"
```

---

### Phase 1 wrap-up

Run the full suite:

```bash
yarn turbo run test:ci --filter=@navios/builder
yarn turbo run lint --filter=@navios/builder
yarn turbo run build --filter=@navios/builder
```

All green → Phase 1 complete. Consider opening a draft PR at this point for review independent of Phase 2.

---

## Phase 2 — `@navios/react-query` envelope-aware bridge

### Task 13: Detect envelope at the type level + default `processResponse` to identity

**Files:**
- Modify: `packages/react-query/src/common/types.mts`
- Modify: `packages/react-query/src/query/types.mts`
- Modify: `packages/react-query/src/query/make-options.mts`
- Create: `packages/react-query/src/common/types.spec-d.mts`

**Step 1: Type test**

```ts
import { expectTypeOf, test } from 'vitest'

import { z } from 'zod/v4'

import type { EndpointHandler } from '@navios/builder'

import type { IsEnvelope } from './types.mjs'

const dataEp = (() => null) as unknown as EndpointHandler<{
  method: 'GET'; url: '/u'; responseSchema: z.ZodObject<{ a: z.ZodString }>
}, false>

const envEp = (() => null) as unknown as EndpointHandler<{
  method: 'GET'; url: '/u'; responseSchema: z.ZodObject<{ a: z.ZodString }>; result: 'envelope'
}, false>

test('IsEnvelope detects per-endpoint result', () => {
  expectTypeOf<IsEnvelope<typeof dataEp>>().toEqualTypeOf<false>()
  expectTypeOf<IsEnvelope<typeof envEp>>().toEqualTypeOf<true>()
})
```

**Step 2: Implement `IsEnvelope`** in `packages/react-query/src/common/types.mts`:

```ts
import type { EndpointHandler } from '@navios/builder'

export type IsEnvelope<E> = E extends EndpointHandler<infer O, boolean>
  ? O extends { result: 'envelope' }
    ? true
    : false
  : false
```

**Step 3: Default `processResponse` to identity**

In `packages/react-query/src/query/make-options.mts` change the `processResponse` field of `MakeQueryOptionsParams` to optional:

```ts
processResponse?: (data: InferEndpointReturn<Options, UseDiscriminator>) => Result
```

In the implementation, replace `const processResponse = options.processResponse` with:

```ts
const processResponse = options.processResponse ?? ((data: never) => data as unknown as Result)
```

Update `Result` default to keep `QueryResult<Options, UseDiscriminator>` (no behaviour change for non-envelope users).

**Step 4: Run & commit**

```bash
yarn turbo run test:ci --filter=@navios/react-query
yarn turbo run lint --filter=@navios/react-query
git add packages/react-query/src/common/types.mts packages/react-query/src/common/types.spec-d.mts packages/react-query/src/query/make-options.mts packages/react-query/src/query/types.mts
git commit -m "feat(react-query): add IsEnvelope detector and make processResponse optional in queries"
```

---

### Task 14: `unwrap` option for queries

**Files:**
- Modify: `packages/react-query/src/query/types.mts`
- Modify: `packages/react-query/src/query/make-options.mts`
- Create: `packages/react-query/src/query/__tests__/envelope-unwrap.spec.mts`

**Step 1: Runtime tests**

```ts
import { QueryClient } from '@tanstack/react-query'
import { create, makeNaviosFakeAdapter } from '@navios/http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { builder } from '@navios/builder'
import { makeQueryOptions } from '../make-options.mjs'

describe('envelope + unwrap', () => {
  const adapter = makeNaviosFakeAdapter()
  const api = builder()
  api.provideClient(create({ adapter: adapter.fetch }))

  const getUser = api.declareEndpoint({
    method: 'GET', url: '/u', responseSchema: z.object({ name: z.string() }),
    errorSchema: { 404: z.object({ msg: z.string() }) },
    result: 'envelope',
  })

  beforeEach(() => adapter.reset())

  it("unwrap: 'none' (default) — envelope is the cached data", async () => {
    adapter.mock('/u', 'GET', () => new Response(JSON.stringify({ name: 'A' }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const opts = makeQueryOptions(getUser, {})({} as never)
    const qc = new QueryClient()
    const data = await qc.fetchQuery(opts)
    expect(data.ok).toBe(true)
    if (data.ok) expect(data.data).toEqual({ name: 'A' })
  })

  it("unwrap: 'throw-on-error' — error variant is thrown, RQ error channel fires", async () => {
    adapter.mock('/u', 'GET', () => new Response(JSON.stringify({ msg: 'gone' }), { status: 404, headers: { 'content-type': 'application/json' } }))
    const opts = makeQueryOptions(getUser, { unwrap: 'throw-on-error' })({} as never)
    const qc = new QueryClient()
    await expect(qc.fetchQuery(opts)).rejects.toMatchObject({ kind: 'http', status: 404 })
  })
})
```

**Step 2: Implement**

Add an `unwrap?: 'none' | 'throw-on-error'` field on `MakeQueryOptionsParams`. In the queryFn:

```ts
queryFn: async ({ signal }) => {
  const result = await endpoint({ signal, ...params } as never)
  const isEnvelope = isResponseEnvelope(result)
  if (isEnvelope) {
    if ((options.unwrap ?? 'none') === 'throw-on-error' && !result.ok) {
      throw result.error
    }
  }
  return processResponse(result as never)
}
```

Define a tiny runtime predicate `isResponseEnvelope(v): v is ResponseEnvelope<any, any>` in `packages/builder/src/types/envelope.mts` (export it; runtime check looks for `typeof v === 'object' && v !== null && 'ok' in v && 'data' in v && 'error' in v && 'response' in v`).

Adjust the `Result` default so that when `IsEnvelope<Endpoint>` is true and `unwrap` is `'throw-on-error'`, the cached data type is `OkBranch['data']` and the error type is `EnvelopeError`. Use TanStack's third generic for error:

```ts
UseSuspenseQueryOptions<TData, TError, ...>
```

where `TError = IsEnvelope<E> extends true ? EnvelopeError : Error`.

**Step 3: Run & commit**

```bash
yarn turbo run test:ci --filter=@navios/react-query
yarn turbo run lint --filter=@navios/react-query
git add packages/react-query/src/query/
git commit -m "feat(react-query): add unwrap option for envelope queries (none | throw-on-error)"
```

---

### Task 15: Same for mutations

**Files:**
- Modify: `packages/react-query/src/mutation/types.mts`
- Modify: `packages/react-query/src/mutation/make-hook.mts`
- Add tests in `packages/react-query/src/__tests__/make-mutation.spec.mts`

Same shape as Task 14:
- `processResponse` becomes optional.
- New `unwrap?: 'none' | 'throw-on-error'`.
- In `mutationFn`: if envelope + `unwrap: 'throw-on-error'` and `!response.ok`, throw `response.error`.
- Type the mutation's third generic (`TError`) as `EnvelopeError` when envelope + `unwrap: 'throw-on-error'`.

Add at least:
- A test that envelope mutations cache the envelope (`unwrap: 'none'`).
- A test that `unwrap: 'throw-on-error'` makes `onError` fire with a typed `EnvelopeError`.

```bash
git add packages/react-query/src/mutation/
git commit -m "feat(react-query): add unwrap option for envelope mutations"
```

---

### Task 16: Same for infinite queries, plus `unwrap: 'pages'`

**Files:**
- Modify: `packages/react-query/src/query/make-infinite-options.mts`
- Modify: `packages/react-query/src/query/types.mts`
- Add tests.

In addition to `'none'` and `'throw-on-error'`, add `'pages'`:

- `'pages'`: queryFn awaits the endpoint, and if envelope:
  - on `ok` → return `result.data` so each page in `data.pages` is the body.
  - on `!ok` → throw `result.error` (treats unrecoverable page error as a fetch failure).
- Default is `'none'`.

`getNextPageParam` then receives whichever shape `unwrap` produces — envelope for `'none'`, data body for `'pages'`. Type both via conditional inference.

Tests:
- `'pages'` returns flat bodies in `data.pages`.
- `'none'` returns envelopes.
- Mixed: a page that errors stops pagination.

```bash
git add packages/react-query/src/query/
git commit -m "feat(react-query): add unwrap (none | throw-on-error | pages) for infinite queries"
```

---

### Task 17: Thread `unwrap` through `declareClient` surface

**Files:**
- Modify: `packages/react-query/src/client/declare-client.mts`
- Modify: `packages/react-query/src/client/types/*.mts`
- Tests.

Each of `query`, `queryFromEndpoint`, `mutation`, `mutationFromEndpoint`, `infiniteQuery`, `infiniteQueryFromEndpoint`, `multipartMutation` gains an optional `unwrap` field with the appropriate union. Inline configs that include `result: 'envelope'` enable the option; for `xxxFromEndpoint`, detect envelope mode by reading `endpoint.config.result`.

Add an integration test:

```ts
const userQuery = client.query({
  method: 'GET', url: '/u',
  responseSchema: userSchema,
  result: 'envelope',
  unwrap: 'throw-on-error',
})
// userQuery.use() should expose error: EnvelopeError | null and data: User | undefined
```

```bash
git add packages/react-query/src/client/
git commit -m "feat(react-query): expose unwrap option on every client.xxx surface"
```

---

### Task 18: Update README + CHANGELOG + spec for react-query

**Files:**
- `packages/react-query/README.md`
- `packages/react-query/CHANGELOG.md`
- `specs/navios-react-query.md`

Document:
- `processResponse` is now optional everywhere.
- New `unwrap` option, with examples of all three modes (queries, infinite, mutations).
- Migration: existing `processResponse: (data) => data` calls can be deleted.
- An end-to-end example of envelope-aware query with header inspection in the render path.

```bash
git commit -m "docs(react-query): document envelope unwrap modes and optional processResponse"
```

---

### Phase 2 wrap-up

```bash
yarn turbo run test:ci --filter=@navios/react-query
yarn turbo run lint --filter=@navios/react-query
yarn turbo run build --filter=@navios/react-query
yarn build   # full repo
yarn test:ci # full repo
```

Open the PR(s). The design doc and this plan are linked from the PR description.

---

## Out-of-scope follow-ups (file separately if desired)

- Socket / SSE envelope equivalents.
- `endpoint.toRequestConfig(params)` helper.
- A `select`-vs-`processResponse` documentation pass to standardize transformation idioms.
- Codemod for `useDiscriminatorResponse: true` users.
