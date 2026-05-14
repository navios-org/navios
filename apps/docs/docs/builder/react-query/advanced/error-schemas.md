---
sidebar_position: 4
---

# Error Schema Handling

`@navios/builder`'s envelope mode (`result: 'envelope'`) plus `errorSchema` lets you discriminate API errors by HTTP status without throwing. In `@navios/react-query`, envelope endpoints integrate with TanStack Query through the `unwrap` option.

## Overview

In v1, the discriminator path conflated success and error responses into a single discriminated union returned through the data channel. In v2 the success and error sides are split into a typed envelope:

```ts
type ResponseEnvelope<Data, Error> =
  | { ok: true; data: Data; error: null; response: ResponseMeta }
  | { ok: false; data: undefined; error: EnvelopeError<Error>; response: ResponseMeta }
```

The `error` variant is a typed union (`http`, `http-unknown`, `validation`, `network`) and `error.body` carries the parsed payload from `errorSchema`.

## Setting Up Envelope Mode

Either opt in per-endpoint with `result: 'envelope'`, or set a default for the whole builder:

```typescript
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { declareClient } from '@navios/react-query'

// Per-builder default; can be overridden per-endpoint
const api = builder({ defaults: { result: 'envelope' } })
api.provideClient(create({ baseURL: 'https://api.example.com' }))

const client = declareClient({ api })
```

## Defining Error Schemas

Use `errorSchema` to map status codes to Zod schemas:

```typescript
const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  errorSchema: {
    400: z.object({ error: z.string(), code: z.number() }),
    404: z.object({ notFound: z.literal(true), message: z.string() }),
    500: z.object({ serverError: z.string(), traceId: z.string() }),
  },
  result: 'envelope',
})
```

## Reading Envelopes

By default (`unwrap: 'none'`) the helper returns the full envelope as `data`. Use `isHttpError` to narrow status and `error.body` to access the typed payload:

```tsx
import { isHttpError } from '@navios/builder'

function UserProfile({ userId }: { userId: string }) {
  const envelope = getUser.useSuspense({ urlParams: { userId } })

  if (envelope.error) {
    if (isHttpError(envelope.error, 404)) {
      return <NotFound message={envelope.error.body.message} />
    }
    if (isHttpError(envelope.error, 400)) {
      return <ErrorMessage error={envelope.error.body.error} />
    }
    if (isHttpError(envelope.error, 500)) {
      return <ServerError traceId={envelope.error.body.traceId} />
    }
    return <ErrorMessage error="Unknown error" />
  }

  return (
    <div>
      <h1>{envelope.data.name}</h1>
      <p>{envelope.data.email}</p>
    </div>
  )
}
```

## Classic React Query Ergonomics with `unwrap: 'throw-on-error'`

If you want envelope errors to flow through TanStack Query's `error` channel (so `data` is the unwrapped body), add `unwrap: 'throw-on-error'`:

```typescript
const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  errorSchema: {
    404: z.object({ notFound: z.literal(true) }),
  },
  result: 'envelope',
  unwrap: 'throw-on-error',
})

// data is User | undefined, error is EnvelopeError | null
const { data, error } = getUser.use({ urlParams: { userId: '123' } })
```

## Mutations with Error Schemas

Envelope + `errorSchema` works identically on mutations. Transform inside `onSuccess` (mutations do not have a read-side `select`):

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  responseSchema: userSchema,
  errorSchema: {
    400: z.object({
      validationErrors: z.array(z.object({
        field: z.string(),
        message: z.string(),
      })),
    }),
    409: z.object({
      conflict: z.literal(true),
      existingId: z.string(),
    }),
  },
  result: 'envelope',
  unwrap: 'throw-on-error',
})
```

### Using Mutation Results

```tsx
import { isHttpError } from '@navios/builder'

function CreateUserForm() {
  const { mutateAsync, isPending } = createUser()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const handleSubmit = async (formData: FormData) => {
    setError(null)
    setFieldErrors({})

    try {
      const user = await mutateAsync({
        data: {
          name: formData.get('name') as string,
          email: formData.get('email') as string,
        },
      })
      navigate(`/users/${user.id}`)
    } catch (err) {
      if (isHttpError(err, 400)) {
        const errors: Record<string, string> = {}
        err.body.validationErrors.forEach((e) => {
          errors[e.field] = e.message
        })
        setFieldErrors(errors)
      } else if (isHttpError(err, 409)) {
        setError(`User already exists: ${err.body.existingId}`)
      } else {
        setError('Unknown error')
      }
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="error">{error}</div>}
      <input name="name" />
      {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
      <input name="email" type="email" />
      {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create User'}
      </button>
    </form>
  )
}
```

## Status Code Access

The envelope `error.status` field carries the HTTP status; no `__status` injection is needed. `isHttpError(error, status)` narrows both the status and the typed body:

```typescript
if (envelope.error && envelope.error.kind === 'http') {
  console.log(`Error with status ${envelope.error.status}`)
}
```

## Global Error Logging

Register a global `onError` hook on the builder for cross-cutting error handling. The hook receives a structured `BuilderErrorEvent` on every failure path (HTTP, validation, network):

```typescript
const api = builder({
  defaults: { result: 'envelope' },
  onError: (event) => {
    if (event.kind === 'http') {
      reportHttpError(event.endpoint, event.status, event.body)
    } else if (event.kind === 'validation') {
      reportZodFailure(event.endpoint, event.zodIssues)
    } else if (event.kind === 'network') {
      reportNetworkFailure(event.endpoint, event.cause)
    }
  },
})
```

The v1 `onFail` per-helper callback and `onZodError` builder callback were removed — use `onError(event)` and filter on `event.kind`.

## Best Practices

### Lean on Status Codes, Not Body Discriminants

In v2 the envelope error already carries `status` and `kind`. Design your `errorSchema` payloads to be simple per-status bodies rather than tagged unions:

```typescript
// ✅ Good - simple per-status bodies; isHttpError(error, status) narrows the body
errorSchema: {
  400: z.object({ errors: z.array(z.object({ field: z.string(), message: z.string() })) }),
  404: z.object({ message: z.string() }),
  500: z.object({ traceId: z.string() }),
}
```

### Use `select` for Cosmetic Projections

When you want to project a piece of the envelope to a derived shape on read, pass `select` to `use` / `useSuspense`:

```typescript
const { data: name } = getUser.use(
  { urlParams: { userId } },
  { select: (envelope) => envelope.data?.name ?? 'Unknown' },
)
```

## Complete Example

```typescript
// queries.ts
const api = builder({ defaults: { result: 'envelope' } })
api.provideClient(create({ baseURL: '/api' }))

const client = declareClient({ api })

const commonErrorSchema = {
  401: z.object({ unauthorized: z.literal(true) }),
  403: z.object({ forbidden: z.literal(true), requiredRole: z.string() }),
  500: z.object({ serverError: z.string(), traceId: z.string() }),
}

export const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    role: z.string(),
  }),
  errorSchema: {
    ...commonErrorSchema,
    404: z.object({ notFound: z.literal(true) }),
  },
})
```

```tsx
// UserProfile.tsx
import { isHttpError } from '@navios/builder'

function UserProfile({ userId }: { userId: string }) {
  const envelope = getUser.useSuspense({ urlParams: { userId } })

  if (envelope.error) {
    if (isHttpError(envelope.error, 401)) return <RedirectToLogin />
    if (isHttpError(envelope.error, 403)) return <AccessDenied requiredRole={envelope.error.body.requiredRole} />
    if (isHttpError(envelope.error, 404)) return <NotFound message="User not found" />
    if (isHttpError(envelope.error, 500)) return <ServerError traceId={envelope.error.body.traceId} />
    return <ErrorMessage error="Unknown error" />
  }

  return (
    <div>
      <h1>{envelope.data.name}</h1>
      <p>{envelope.data.email}</p>
      <Badge>{envelope.data.role}</Badge>
    </div>
  )
}
```

## Next Steps

- [Discriminated Unions](/docs/builder/builder/advanced/discriminated-unions) - Working with `responseSchema` discriminated unions
- [Error Handling](/docs/builder/builder/guides/error-handling) - The unified `onError(event)` hook
- [Queries](/docs/builder/react-query/guides/queries) - Basic query usage
