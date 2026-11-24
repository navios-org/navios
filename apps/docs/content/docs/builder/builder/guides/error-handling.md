---
sidebar_position: 5
---

# Error Handling

Every failed endpoint call produces one error type, `EndpointError`. You choose per call whether it is thrown or returned as a value, and you tell failures apart by `error.kind`.

## Two Ways to Call

```typescript
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// Throws an EndpointError on any failure
const user = await getUser({ urlParams: { userId: '123' } })

// Never throws - resolves to a SafeResult
const result = await getUser.safe({ urlParams: { userId: '123' } })
```

Both styles run the same pipeline and produce the same `EndpointError` for the same failure. Use the throwing call when a failure should propagate (to an error boundary, a framework, React Query); use `safe()` when you want to handle the failure right where you make the call.

## `safe()` and `SafeResult`

`safe()` resolves to a discriminated union. Narrow on `ok`:

```typescript
const result = await getUser.safe({ urlParams: { userId: '123' } })

if (result.ok) {
  result.data // z.output<typeof userSchema>
  result.response // ResponseMeta: { status, statusText, headers }
} else {
  result.error // EndpointError
  result.response // ResponseMeta | null (null when no response was received)
}
```

`safe()` never rejects. Invalid input, a missing client and a missing URL parameter all arrive as `ok: false`.

## EndpointError

```typescript
class EndpointError extends NaviosError {
  kind: EndpointErrorKind
  endpoint: { method: HttpMethod; url: string } // url is the template, e.g. '/users/$userId'
  status?: number
  body?: unknown
  response: ResponseMeta | null
  issues?: readonly SchemaIssue[]
  cause?: unknown
  toJSON(): object
}
```

### Error Kinds

| `kind`                | When                                                                                | `status` | `body`               |
| --------------------- | ----------------------------------------------------------------------------------- | -------- | -------------------- |
| `http`                | Non-2xx status that has an `errorSchema` entry, and the body parsed                 | yes      | parsed schema output |
| `http-unknown`        | Non-2xx status without an `errorSchema` entry                                       | yes      | raw response body    |
| `request-validation`  | `urlParams`, `params` or `data` failed its schema. No request was sent              | no       | no                   |
| `response-validation` | A 2xx body failed `responseSchema` (or its `responses` entry), a 2xx status is not listed in `responses`, or an error body failed its `errorSchema` entry | yes | raw response body |
| `network`             | No response was received and the request was not cancelled                          | no       | no                   |
| `timeout`             | The request timed out                                                               | no       | no                   |
| `aborted`             | The request was cancelled through its `AbortSignal`                                 | no       | no                   |
| `config`              | The call could not be made: no client was provided, or a URL parameter is missing   | no       | no                   |

`issues` holds the validation issues for the two validation kinds. Each one is a `SchemaIssue`:

```typescript
interface SchemaIssue {
  readonly message: string
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[]
}
```

That is the issue shape of Standard Schema, so it is the same whichever schema library produced it. Zod's issues satisfy it and keep their extra fields (`code`, `expected`, ...) at runtime.

`cause` is the original thrown value — for a transport failure, the client's error. For a validation failure of a Zod schema it is the `ZodError`, which is the place to go for Zod-specific helpers; schemas from other libraries leave it `undefined`:

```typescript
import { z } from 'zod'

if (error.kind === 'request-validation' && error.cause instanceof z.ZodError) {
  console.log(z.flattenError(error.cause).fieldErrors)
}
```

## Typed Error Bodies with `errorSchema`

`errorSchema` maps HTTP status codes to schemas. When a response arrives with one of those statuses, its body is parsed with the matching schema and reported as kind `http`:

```typescript
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  errorSchema: {
    400: z.object({ error: z.string(), field: z.string() }),
    404: z.object({ message: z.string() }),
  },
})

const result = await getUser.safe({ urlParams: { userId: '123' } })

if (!result.ok) {
  const { error } = result

  if (error.kind === 'http' && error.status === 404) {
    console.log(error.body.message) // typed from errorSchema[404]
  } else if (error.kind === 'http' && error.status === 400) {
    console.log(error.body.field) // typed from errorSchema[400]
  } else if (error.kind === 'http-unknown') {
    console.log(error.status, error.body) // number, unknown
  }
}
```

Narrowing on `kind === 'http'` narrows `status` to the declared codes; narrowing on `status` narrows `body` to that schema's output.

- `error.body` is exactly what the schema produced. Nothing is added to it or renamed in it.
- A status with no entry is reported as `http-unknown` with the raw body.
- An error body that does not match its schema is reported as `response-validation`.

`errorSchema` works the same for the throwing call — the thrown error carries the parsed `body`.

## Handling Thrown Errors

In a `catch` block the value is `unknown`. Use the guards to get back to a typed error:

```typescript
import { isEndpointError, isHttpError } from '@navios/builder'

try {
  const user = await getUser({ urlParams: { userId: '123' } })
} catch (error) {
  if (!isEndpointError(error)) throw error

  switch (error.kind) {
    case 'aborted':
      return
    case 'network':
    case 'timeout':
      showToast('Connection problem. Please try again.')
      break
    case 'http':
    case 'http-unknown':
      showToast(`Request failed (${error.status})`)
      break
    default:
      throw error
  }
}
```

`isHttpError(error, status?)` checks for kind `http`, optionally for one status. Pass the endpoint's error schema as the type argument to get a typed `body`:

```typescript
try {
  await getUser({ urlParams: { userId: '123' } })
} catch (error) {
  if (isHttpError<typeof getUser.config.errorSchema, 404>(error, 404)) {
    console.log(error.body.message) // typed from errorSchema[404]
  }
}
```

To name an endpoint's full error type — for a helper function or a component prop — use `EndpointErrorType`:

```typescript
import type { EndpointErrorType } from '@navios/builder'

type GetUserError = EndpointErrorType<typeof getUser>

function describeGetUserError(error: GetUserError): string {
  if (error.kind === 'http' && error.status === 404) return error.body.message
  if (error.kind === 'timeout') return 'The server took too long to answer'
  return 'Something went wrong'
}
```

## Validation Errors

Input is validated before anything is sent. A failure in `urlParamsSchema`, `querySchema` or `requestSchema` is reported as `request-validation`:

```typescript
const result = await createUser.safe({ data: { name: '', email: 'not-an-email' } })

if (!result.ok && result.error.kind === 'request-validation') {
  for (const issue of result.error.issues) {
    console.log(issue.path?.join('.'), issue.message)
  }
}
```

A response that does not match its schema is reported as `response-validation`, and so is a 2xx status missing from an endpoint's [`responses`](/docs/builder/builder/guides/defining-endpoints#per-status-responses) map. `error.body` holds the raw body and `error.issues` explains what did not match — usually a sign that the client and the server disagree about the contract.

## Cancellation and Timeouts

```typescript
const controller = new AbortController()

const result = await getUser.safe({
  urlParams: { userId: '123' },
  signal: controller.signal,
  timeout: 5000,
})

if (!result.ok && result.error.kind === 'aborted') {
  // cancelled by controller.abort()
}
if (!result.ok && result.error.kind === 'timeout') {
  // no answer within 5 seconds
}
```

`timeout` can also be set on the endpoint declaration; the per-call value wins.

## Response Metadata

`result.response` and `error.response` expose the status line and headers of the response. `headers` is a `Headers` instance. Three helpers cover common reads and accept `null`:

```typescript
import { getCookie, getHeader, getRetryAfterMs } from '@navios/builder'

const result = await listUsers.safe({ params: { page: 1 } })

const total = getHeader(result.response, 'x-total-count') // string | null
const session = getCookie(result.response, 'sid') // string | null, from Set-Cookie

if (!result.ok && result.error.status === 429) {
  const retryMs = getRetryAfterMs(result.response) // number | null
}
```

## Global `onError` Hook

`onError` is called once for every failed call, with the same `EndpointError` instance the caller receives — whether it is thrown or returned by `safe()`:

```typescript
const API = builder({
  client,
  onError: (error) => {
    if (error.kind === 'aborted') return

    logger.warn('API call failed', error.toJSON())

    if (error.status === 401) {
      redirectToLogin()
    }
  },
})
```

The hook is for telemetry and cross-cutting reactions. It cannot change the outcome of a call: its return value is ignored, and an exception thrown inside it is caught and logged.

`error.toJSON()` returns a plain object without `cause` and with headers flattened to a record, so it is safe to pass to `JSON.stringify` and to loggers.

## Patterns

### Retry

```typescript
import { getRetryAfterMs } from '@navios/builder'

const RETRYABLE = new Set(['network', 'timeout'])

async function getUserWithRetry(userId: string, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    const result = await getUser.safe({ urlParams: { userId } })
    if (result.ok) return result.data

    const { error } = result
    const retryable =
      RETRYABLE.has(error.kind) || (error.status !== undefined && error.status >= 500)
    if (!retryable || attempt === attempts) throw error

    const delay = getRetryAfterMs(error.response) ?? 1000 * attempt
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
}
```

### User-Friendly Messages

```typescript
import type { EndpointError } from '@navios/builder'

function getErrorMessage(error: EndpointError): string {
  switch (error.kind) {
    case 'request-validation':
      return 'Please check your input and try again.'
    case 'network':
      return 'Unable to connect. Please check your internet connection.'
    case 'timeout':
      return 'The server took too long to respond.'
    case 'http':
    case 'http-unknown':
      if (error.status === 401) return 'Please log in to continue.'
      if (error.status === 403) return 'You do not have permission to do this.'
      if (error.status === 404) return 'The requested resource was not found.'
      return 'The server reported an error. Please try again later.'
    default:
      return 'An unexpected error occurred.'
  }
}
```

### React

```tsx
function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    getUser.safe({ urlParams: { userId }, signal: controller.signal }).then((result) => {
      if (result.ok) {
        setUser(result.data)
      } else if (result.error.kind !== 'aborted') {
        setError(getErrorMessage(result.error))
      }
    })

    return () => controller.abort()
  }, [userId])

  if (error) return <div>Error: {error}</div>
  if (!user) return <div>Loading...</div>
  return <div>{user.name}</div>
}
```

## Errors at Declaration

A mistake in a declaration is reported immediately, as a plain `NaviosError` thrown by `declareEndpoint` — for example a `urlParamsSchema` whose keys do not match the URL's parameters. `EndpointError` extends `NaviosError`, so `error instanceof NaviosError` matches everything the builder throws.

## Best Practices

- **Pick the call style per call site.** `safe()` for expected failures you handle locally, the throwing call when a boundary further up deals with it.
- **Declare `errorSchema` for statuses you act on.** A 404 or 409 you branch on deserves a typed body; everything else can stay `http-unknown`.
- **Switch on `kind`, then on `status`.** `status` alone is `undefined` for failures that never produced a response.
- **Ignore `aborted` in the UI.** A cancelled request is rarely something to show the user.
- **Keep `onError` for reporting.** Put recovery logic next to the call.

## Next Steps

- [HTTP Client Setup](/docs/builder/builder/guides/http-client) - The client contract and how failures are classified
- [Defining Endpoints](/docs/builder/builder/guides/defining-endpoints) - Declare endpoints with error schemas
- [API Reference](/docs/builder/builder/api-reference) - `EndpointError`, `SafeResult` and the guards
