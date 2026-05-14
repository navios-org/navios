---
sidebar_position: 5
---

# Error Handling

Builder provides comprehensive error handling capabilities, from validation errors to HTTP errors. This guide covers all the ways to handle errors gracefully.

## Error Types

### NaviosError

`NaviosError` is the base error class for all Builder errors:

```typescript
import { NaviosError } from '@navios/builder'

try {
  await getUser({ urlParams: { userId: '123' } })
} catch (error) {
  if (error instanceof NaviosError) {
    console.error('Navios Error:', error.message)
    console.error('Original error:', error.cause)
  }
}
```

### ZodError

When response validation fails, a `ZodError` is thrown:

```typescript
import { ZodError } from 'zod'

try {
  const user = await getUser({ urlParams: { userId: '123' } })
} catch (error) {
  if (error instanceof ZodError) {
    console.error('Validation failed:', error.errors)
    // error.errors is an array of validation issues
    error.errors.forEach((err) => {
      console.error(`Field ${err.path.join('.')}: ${err.message}`)
    })
  }
}
```

### HTTP Errors

HTTP errors (4xx, 5xx) are typically wrapped in `NaviosError`:

```typescript
try {
  await getUser({ urlParams: { userId: '123' } })
} catch (error) {
  if (error instanceof NaviosError) {
    // Check if it's an HTTP error
    if (error.cause && 'status' in error.cause) {
      const status = (error.cause as any).status
      if (status === 404) {
        console.error('User not found')
      } else if (status === 500) {
        console.error('Server error')
      }
    }
  }
}
```

## Unified Global `onError` Hook

In v2, every error path — HTTP, Zod validation (on both error responses and 2xx bodies), and network failures — flows through one `onError(event: BuilderErrorEvent)` hook. The event carries `kind`, `endpoint`, `status`, `zodIssues`, `cause`, `body`. Filter on `event.kind` instead of registering separate callbacks.

```typescript
const API = builder({
  onError: (event) => {
    // Every failure path lands here.
    console.error('API Error:', event.kind, event.endpoint, event.status)

    if (event.kind === 'validation') {
      console.error('Validation failed:', event.zodIssues, 'body:', event.body)
      showToast('Invalid response from server. Please try again.')
    } else if (event.kind === 'network') {
      showToast('Network error. Check your connection.')
    } else if (event.kind === 'http' && event.status === 401) {
      redirectToLogin()
    }

    // Log to error tracking service
    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.captureException(event.cause, {
        tags: { kind: event.kind, url: event.endpoint?.url },
      })
    }
  },
})
```

The v1 `onZodError` callback was removed in v2 — filter on `event.kind === 'validation'` inside the unified `onError`.

## Error Handling Patterns

### Try-Catch

Basic error handling:

```typescript
async function fetchUser(userId: string) {
  try {
    const user = await getUser({ urlParams: { userId } })
    return { success: true, data: user }
  } catch (error) {
    if (error instanceof NaviosError) {
      return { success: false, error: error.message }
    }
    return { success: false, error: 'Unknown error' }
  }
}
```

### Error Type Checking

```typescript
async function fetchUser(userId: string) {
  try {
    const user = await getUser({ urlParams: { userId } })
    return user
  } catch (error) {
    if (error instanceof ZodError) {
      // Handle validation error
      console.error('Invalid response format')
      throw new Error('Server returned invalid data')
    } else if (error instanceof NaviosError) {
      // Handle Navios error
      if (error.cause && 'status' in error.cause) {
        const status = (error.cause as any).status
        if (status === 404) {
          throw new Error('User not found')
        }
      }
      throw error
    } else {
      // Handle unknown error
      throw new Error('Failed to fetch user')
    }
  }
}
```

### Error Wrapper Function

Create a reusable error handler:

```typescript
async function handleRequest<T>(
  request: () => Promise<T>
): Promise<{ data?: T; error?: string }> {
  try {
    const data = await request()
    return { data }
  } catch (error) {
    if (error instanceof ZodError) {
      return { error: 'Invalid response format' }
    } else if (error instanceof NaviosError) {
      return { error: error.message }
    }
    return { error: 'Unknown error occurred' }
  }
}

// Usage
const result = await handleRequest(() => getUser({ urlParams: { userId: '123' } }))
if (result.error) {
  console.error(result.error)
} else {
  console.log(result.data)
}
```

## Error Schema + Envelope Mode

For APIs that return different error shapes by HTTP status code, combine `errorSchema` with `result: 'envelope'`. Error responses are surfaced as typed variants on `envelope.error` instead of thrown, with the full `response` meta attached.

```typescript
import { builder, isHttpError } from '@navios/builder'

const API = builder()

const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  errorSchema: {
    400: z.object({ error: z.string(), field: z.string() }),
    404: z.object({ error: z.literal('Not Found') }),
    500: z.object({ error: z.string() }),
  },
  result: 'envelope',
})

const { data, error, response } = await getUser({ urlParams: { userId: '123' } })

if (isHttpError(error, 404)) {
  console.log('Not found') // error.body is the 404 schema
} else if (isHttpError(error, 400)) {
  console.log('Invalid:', error.body.field)
} else if (error) {
  console.log('Other error:', error.kind, error.status) // includes http-unknown / validation / network
} else {
  console.log('User:', data.name) // success
}
```

### How errorSchema Works in Envelope Mode

1. **Successful responses** (2xx) are validated against `responseSchema` and land in `envelope.data`.
2. **Error responses** matching a status code in `errorSchema` are validated against that schema and land on `envelope.error.body`, with `error.kind === 'http'`.
3. **Unmatched error status codes** become the `http-unknown` envelope variant; `error.body` is the raw payload.
4. **Network failures** become the `network` envelope variant.
5. **Validation failures** become the `validation` envelope variant; `error.zodIssues` carries the issues.

### Type Guards

Builder provides narrowing guards for the envelope `error` variants:

```typescript
import { isHttpError, isValidationError, isNetworkError, isUnknownHttpError } from '@navios/builder'

if (isHttpError(error, 404)) {
  // error.body is narrowed to the 404 schema
}
if (isValidationError(error)) {
  // error.zodIssues is available
}
```

The v1 `isErrorStatus`, `isErrorResponse`, `__status` injection, and `UnknownResponseError` class were removed in v2 — envelope mode replaces them.

## Discriminated Union Responses

For APIs that return different shapes for success/error in the same 2xx response body, use a Zod discriminated union on `responseSchema`:

```typescript
const API = builder()

const responseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    data: userSchema,
  }),
  z.object({
    status: z.literal('error'),
    error: z.string(),
  }),
])

const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema,
})

const result = await getUser({ urlParams: { userId: '123' } })
if (result.status === 'success') {
  console.log(result.data)
} else {
  console.error(result.error)
}
```

This is a pure Zod feature — there is no builder-level mode to enable. See [Discriminated Unions](/docs/builder/builder/advanced/discriminated-unions) for the full comparison with envelope mode.

## HTTP Status Code Handling

### Status Code Checking

```typescript
async function fetchUser(userId: string) {
  try {
    const user = await getUser({ urlParams: { userId } })
    return user
  } catch (error) {
    if (error instanceof NaviosError && error.cause) {
      const httpError = error.cause as { status?: number }
      switch (httpError.status) {
        case 400:
          throw new Error('Invalid request')
        case 401:
          throw new Error('Unauthorized')
        case 403:
          throw new Error('Forbidden')
        case 404:
          throw new Error('User not found')
        case 500:
          throw new Error('Server error')
        default:
          throw error
      }
    }
    throw error
  }
}
```

### Retry Logic

```typescript
async function fetchUserWithRetry(userId: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await getUser({ urlParams: { userId } })
    } catch (error) {
      if (error instanceof NaviosError && error.cause) {
        const httpError = error.cause as { status?: number }
        // Don't retry on client errors
        if (httpError.status && httpError.status < 500) {
          throw error
        }
      }
      
      // Last retry
      if (i === retries - 1) {
        throw error
      }
      
      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)))
    }
  }
}
```

## User-Friendly Error Messages

### Error Message Mapping

```typescript
function getErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return 'Invalid data received from server'
  } else if (error instanceof NaviosError) {
    if (error.cause && 'status' in error.cause) {
      const status = (error.cause as any).status
      switch (status) {
        case 400:
          return 'Invalid request. Please check your input.'
        case 401:
          return 'You are not authorized. Please log in.'
        case 403:
          return 'You do not have permission to perform this action.'
        case 404:
          return 'The requested resource was not found.'
        case 500:
          return 'Server error. Please try again later.'
        default:
          return 'An error occurred. Please try again.'
      }
    }
    return error.message
  }
  return 'An unexpected error occurred'
}
```

### React Error Display

```typescript
function UserProfile({ userId }: { userId: string }) {
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    getUser({ urlParams: { userId } })
      .then((user) => {
        // Handle success
        setError(null)
      })
      .catch((err) => {
        setError(getErrorMessage(err))
      })
  }, [userId])
  
  if (error) {
    return <div className="error">{error}</div>
  }
  
  // ...
}
```

## Logging Errors

### Error Logging Service

```typescript
const API = builder({
  onError: (event) => {
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('API Error:', event.kind, event.endpoint, event.cause)
    }

    // Log validation errors with structured detail
    if (event.kind === 'validation') {
      console.error('Validation Error:', {
        zodIssues: event.zodIssues,
        body: event.body,
      })
    }

    // Log to error tracking service in production
    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.captureException(event.cause, {
        tags: { source: 'navios-builder', kind: event.kind, url: event.endpoint?.url },
      })
    }
  },
})
```

## Best Practices

### Always Handle Errors

```typescript
// ✅ Good - error handling
async function fetchUser(userId: string) {
  try {
    return await getUser({ urlParams: { userId } })
  } catch (error) {
    // Handle error appropriately
    console.error('Failed to fetch user:', error)
    throw error
  }
}

// ❌ Bad - unhandled errors
async function fetchUser(userId: string) {
  return await getUser({ urlParams: { userId } })
}
```

### Use Specific Error Types

```typescript
// ✅ Good - check error type
try {
  await getUser({ urlParams: { userId: '123' } })
} catch (error) {
  if (error instanceof ZodError) {
    // Handle validation error
  } else if (error instanceof NaviosError) {
    // Handle Navios error
  }
}

// ❌ Bad - generic error handling
try {
  await getUser({ urlParams: { userId: '123' } })
} catch (error) {
  console.error(error) // Too generic
}
```

### Provide User-Friendly Messages

```typescript
// ✅ Good - user-friendly message
catch (error) {
  if (error instanceof NaviosError) {
    showToast('Failed to load user. Please try again.')
  }
}

// ❌ Bad - technical error message
catch (error) {
  showToast(error.message) // May be too technical
}
```

### Use Global Error Handlers

```typescript
// ✅ Good - global error handling
const API = builder({
  onError: (error) => {
    // Centralized error handling
    logError(error)
  },
})

// ❌ Bad - error handling in every function
async function fetchUser() {
  try {
    // ...
  } catch (error) {
    logError(error) // Duplicated everywhere
  }
}
```

## Next Steps

- [Discriminated Unions](/docs/builder/builder/advanced/discriminated-unions) - Handle multiple response types
- [HTTP Client Setup](/docs/builder/builder/guides/http-client) - Configure your HTTP client
- [Best Practices](/docs/builder/builder/best-practices) - More error handling patterns

