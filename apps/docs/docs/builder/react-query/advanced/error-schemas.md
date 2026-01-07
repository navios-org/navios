---
sidebar_position: 4
---

# Error Schema Handling

When using `useDiscriminatorResponse: true` mode with `@navios/builder`, API error responses are returned as data instead of being thrown. This enables type-safe error discrimination in your components.

## Overview

By default, HTTP errors (4xx, 5xx) throw exceptions. With discriminator mode, they become part of your response type, allowing you to handle different error cases in a type-safe way.

## Setting Up Discriminator Mode

First, configure your builder to use discriminator response mode:

```typescript
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { declareClient } from '@navios/react-query'

// Enable discriminator mode
const api = builder({ useDiscriminatorResponse: true })
api.provideClient(create({ baseURL: 'https://api.example.com' }))

// Create client with discriminator type parameter
const client = declareClient<true>({ api })
```

## Defining Error Schemas

Use `errorSchema` to define the shape of error responses by status code:

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
    400: z.object({
      error: z.string(),
      code: z.number(),
    }),
    404: z.object({
      notFound: z.literal(true),
      message: z.string(),
    }),
    500: z.object({
      serverError: z.string(),
      traceId: z.string(),
    }),
  },
  processResponse: (data) => {
    // data is typed as the union of all possible responses
    // User | { error, code } | { notFound, message } | { serverError, traceId }
    return data
  },
})
```

## Processing Responses

The `processResponse` callback receives the union of success and error types. Transform this into a result type:

### Result Pattern

```typescript
const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  errorSchema: {
    400: z.object({ error: z.string() }),
    404: z.object({ notFound: z.literal(true) }),
  },
  processResponse: (data) => {
    // Check for error shapes
    if ('error' in data) {
      return { ok: false as const, error: data.error }
    }
    if ('notFound' in data) {
      return { ok: false as const, error: 'User not found' }
    }
    // Success case
    return { ok: true as const, user: data }
  },
})
```

### Using in Components

```tsx
function UserProfile({ userId }: { userId: string }) {
  const result = getUser.useSuspense({ urlParams: { userId } })

  if (!result.ok) {
    return <ErrorMessage error={result.error} />
  }

  return (
    <div>
      <h1>{result.user.name}</h1>
      <p>{result.user.email}</p>
    </div>
  )
}
```

## Mutations with Error Schemas

The same pattern works for mutations:

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
  processResponse: (data) => {
    if ('validationErrors' in data) {
      return {
        ok: false as const,
        type: 'validation' as const,
        errors: data.validationErrors,
      }
    }
    if ('conflict' in data) {
      return {
        ok: false as const,
        type: 'conflict' as const,
        existingId: data.existingId,
      }
    }
    return { ok: true as const, user: data }
  },
})
```

### Using Mutation Results

```tsx
function CreateUserForm() {
  const { mutateAsync, isPending } = createUser()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const handleSubmit = async (formData: FormData) => {
    setError(null)
    setFieldErrors({})

    const result = await mutateAsync({
      data: {
        name: formData.get('name') as string,
        email: formData.get('email') as string,
      },
    })

    if (!result.ok) {
      if (result.type === 'validation') {
        const errors: Record<string, string> = {}
        result.errors.forEach((e) => {
          errors[e.field] = e.message
        })
        setFieldErrors(errors)
      } else if (result.type === 'conflict') {
        setError(`User already exists: ${result.existingId}`)
      }
      return
    }

    // Success - navigate to user page
    navigate(`/users/${result.user.id}`)
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

Error responses include a `__status` property for accessing the HTTP status code:

```typescript
const getUser = client.query({
  // ...
  processResponse: (data) => {
    if ('error' in data) {
      // Access the status code
      const status = (data as any).__status // 400, 404, or 500
      console.log(`Error with status ${status}: ${data.error}`)
      return { ok: false as const, error: data.error, status }
    }
    return { ok: true as const, user: data }
  },
})
```

## Error Handling vs Error Schema

Understanding when to use each approach:

### Error Schema (Discriminator Mode)

Use when:
- API returns structured error responses
- You need to discriminate between different error types
- You want to display error-specific UI
- Validation errors need to be shown inline

```typescript
// Good: API returns structured validation errors
errorSchema: {
  400: z.object({
    errors: z.array(z.object({
      field: z.string(),
      message: z.string(),
    })),
  }),
}
```

### Traditional Error Handling (onFail)

Use when:
- Errors should be logged but not displayed differently
- You want errors to throw and be caught by error boundaries
- Simple error toast/notification is sufficient

```typescript
const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  onFail: (error) => {
    // Log error, show toast, etc.
    // Error is still thrown
    console.error('Failed to fetch user:', error)
    toast.error('Failed to load user')
  },
})
```

## Best Practices

### Use Discriminant Properties

Design your error schemas with clear discriminant properties:

```typescript
// ✅ Good - clear discriminant
errorSchema: {
  400: z.object({ type: z.literal('validation'), errors: z.array(...) }),
  404: z.object({ type: z.literal('not_found'), resource: z.string() }),
  500: z.object({ type: z.literal('server_error'), message: z.string() }),
}

// ❌ Ambiguous - hard to discriminate
errorSchema: {
  400: z.object({ message: z.string() }),
  404: z.object({ message: z.string() }),
  500: z.object({ message: z.string() }),
}
```

### Consistent Result Types

Use a consistent result type across your application:

```typescript
// types.ts
type Result<T, E = string> =
  | { ok: true; data: T }
  | { ok: false; error: E }

// In your queries
processResponse: (data): Result<User, string> => {
  if ('error' in data) {
    return { ok: false, error: data.error }
  }
  return { ok: true, data: data }
}
```

### Create Reusable Error Handlers

For common error patterns, create helper functions:

```typescript
// helpers.ts
function handleApiResponse<T>(
  data: T | { error: string } | { notFound: true },
  successKey: keyof T,
): Result<T> {
  if ('error' in data) {
    return { ok: false, error: data.error }
  }
  if ('notFound' in data) {
    return { ok: false, error: 'Not found' }
  }
  return { ok: true, data }
}

// Usage
processResponse: (data) => handleApiResponse(data, 'id')
```

## Complete Example

```typescript
// queries.ts
const api = builder({ useDiscriminatorResponse: true })
api.provideClient(create({ baseURL: '/api' }))

const client = declareClient<true>({ api })

// Common error schema for all endpoints
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
  processResponse: (data) => {
    // Handle common errors
    if ('unauthorized' in data) {
      return { ok: false as const, type: 'unauthorized' as const }
    }
    if ('forbidden' in data) {
      return { ok: false as const, type: 'forbidden' as const, requiredRole: data.requiredRole }
    }
    if ('serverError' in data) {
      return { ok: false as const, type: 'server_error' as const, message: data.serverError }
    }
    // Endpoint-specific errors
    if ('notFound' in data) {
      return { ok: false as const, type: 'not_found' as const }
    }
    // Success
    return { ok: true as const, user: data }
  },
})
```

```tsx
// UserProfile.tsx
function UserProfile({ userId }: { userId: string }) {
  const result = getUser.useSuspense({ urlParams: { userId } })

  if (!result.ok) {
    switch (result.type) {
      case 'unauthorized':
        return <RedirectToLogin />
      case 'forbidden':
        return <AccessDenied requiredRole={result.requiredRole} />
      case 'not_found':
        return <NotFound message="User not found" />
      case 'server_error':
        return <ServerError message={result.message} />
    }
  }

  return (
    <div>
      <h1>{result.user.name}</h1>
      <p>{result.user.email}</p>
      <Badge>{result.user.role}</Badge>
    </div>
  )
}
```

## Next Steps

- [Discriminated Unions](/docs/builder/builder/advanced/discriminated-unions) - Learn about builder discriminator mode
- [Error Handling](/docs/builder/builder/guides/error-handling) - Traditional error handling
- [Queries](/docs/builder/react-query/guides/queries) - Basic query usage
