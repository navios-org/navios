---
sidebar_position: 4
---

# Typed Errors

Queries and mutations call the throwing form of the endpoint. Every failure reaches React Query's error channel as an `EndpointError`, typed from the endpoint's `errorSchema` — retries, `isError`, `onError` and error boundaries work as in plain TanStack Query.

## Declaring Error Schemas

`errorSchema` maps HTTP status codes to Zod schemas:

```typescript
import { z } from 'zod'

const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  errorSchema: {
    403: z.object({ requiredRole: z.string() }),
    404: z.object({ message: z.string() }),
  },
})
```

## Narrowing

Narrow on `error.kind`, then on `error.status`; `error.body` takes the type of the matching schema:

```typescript
function UserProfile({ userId }: { userId: string }) {
  const { data, isPending, error } = getUser.use({ urlParams: { userId } })

  if (isPending) return <div>Loading...</div>

  if (error) {
    if (error.kind === 'http') {
      // error.status: 403 | 404
      if (error.status === 404) return <div>{error.body.message}</div>
      return <div>Requires the {error.body.requiredRole} role</div>
    }
    if (error.kind === 'network') return <div>You appear to be offline</div>
    return <div>Something went wrong</div>
  }

  return <div>{data.name}</div>
}
```

`error.body` is exactly what the schema produced; nothing is added to it. The status is on the error, not in the body.

## Error Kinds

| `kind`                  | Meaning                                                                    | `status` | `body`        |
| ----------------------- | -------------------------------------------------------------------------- | -------- | ------------- |
| `'http'`                | Non-2xx status declared in `errorSchema`                                   | literal  | schema output |
| `'http-unknown'`        | Non-2xx status without a schema                                            | `number` | raw payload   |
| `'request-validation'`  | `urlParams`, `params` or `data` failed its schema; nothing was sent        | —        | —             |
| `'response-validation'` | A 2xx body failed `responseSchema`, or an error body failed its schema     | `number` | raw payload   |
| `'network'`             | No response was received                                                   | —        | —             |
| `'timeout'`             | The request timed out                                                      | —        | —             |
| `'aborted'`             | The request was cancelled through its `AbortSignal`                        | —        | —             |
| `'config'`              | The call could not be made: no HTTP client, or a missing URL param         | —        | —             |

Every error also has:

- `endpoint` — `{ method, url }` of the endpoint that failed
- `response` — `{ status, statusText, headers }`, or `null` when no response was received
- `issues` — the validation issues (`{ message, path? }`), for the two validation kinds
- `message`, `cause`, and `toJSON()` for logging

An endpoint without an `errorSchema` has no `'http'` variant: every non-2xx response is `'http-unknown'` with `body: unknown`.

## Mutations

The same error is `error` on the hook result, the rejection of `mutateAsync` and the first argument of `onError`:

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: createUserSchema,
  responseSchema: userSchema,
  errorSchema: {
    409: z.object({ reason: z.string() }),
    422: z.object({ fields: z.record(z.string(), z.string()) }),
  },
  useContext: () => ({ toast: useToast() }),
  onError: (error, _variables, context) => {
    if (error.kind === 'http' && error.status === 409) {
      context.toast.error(error.body.reason)
    }
  },
})

function CreateUserForm() {
  const { mutate, error } = createUser()

  const fieldErrors =
    error?.kind === 'http' && error.status === 422 ? error.body.fields : undefined

  // ...
}
```

### Validation Issues

When the variables fail `requestSchema`, the request is not sent and the error carries the schema's issues:

```typescript
const { error } = createUser()

if (error?.kind === 'request-validation') {
  for (const issue of error.issues) {
    console.log(issue.path?.join('.'), issue.message)
  }
}
```

## Outside the Hook Result

In a `catch` block or an error boundary the value is `unknown`. Use the guards from `@navios/builder`:

```typescript
import { isEndpointError, isHttpError } from '@navios/builder'

try {
  await getUser.fetch(queryClient, { urlParams: { userId } })
} catch (error) {
  if (isHttpError(error, 404)) {
    // error.kind === 'http', error.status === 404
  } else if (isEndpointError(error) && error.kind === 'aborted') {
    // cancelled
  } else {
    throw error
  }
}
```

To name the error type of an endpoint, use `EndpointErrorType`:

```typescript
import type { EndpointErrorType } from '@navios/builder'

type GetUserError = EndpointErrorType<typeof getUser.endpoint>

function describe(error: GetUserError): string {
  if (error.kind === 'http' && error.status === 404) return error.body.message
  return error.message
}
```

## Response Headers

`error.response` gives access to the status line and headers of a failed response:

```typescript
import { getRetryAfterMs } from '@navios/builder'

if (error?.kind === 'http-unknown' && error.status === 429) {
  const retryInMs = getRetryAfterMs(error.response)
}
```

## Retries

React Query retries failed queries by default. Use the error kind to retry only what can succeed on a second attempt:

```typescript
const { data } = getUser.use(
  { urlParams: { userId } },
  {
    retry: (failureCount, error) =>
      (error.kind === 'network' || error.kind === 'timeout') && failureCount < 3,
  },
)
```

## Global Error Reporting

The builder's `onError` hook is called once per failed call with the same `EndpointError` the query or mutation receives. Use it for logging and telemetry:

```typescript
const api = builder({
  client: httpClient,
  onError: (error) => {
    if (error.kind === 'aborted') return
    reportError(error.toJSON())
  },
})
```

## Best Practices

- **Declare a schema for every status the UI reacts to.** Undeclared statuses arrive as `'http-unknown'` with an untyped body.
- **Narrow on `kind` and `status`,** not on fields of the body.
- **Do not retry validation and `4xx` failures.** They fail the same way again.
- **Keep reporting in the builder's `onError`** and user feedback in components and mutation callbacks.

## Next Steps

- [Queries](/docs/builder/react-query/guides/queries#error-handling) - Query error handling
- [Mutations](/docs/builder/react-query/guides/mutations#error-handling) - Mutation error handling
- [Builder Error Handling](/docs/builder/builder/guides/error-handling) - `EndpointError` in depth
