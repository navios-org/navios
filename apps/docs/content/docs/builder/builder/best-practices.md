# Best Practices

This guide covers best practices for using `@navios/builder` effectively in your projects.

## Organizing Endpoints

### Centralize API Definitions

Create a centralized API structure:

```typescript
// api/index.ts
import { builder } from '@navios/builder'
import { create } from '@navios/http'

export const API = builder({
  client: create({ baseURL: 'https://api.example.com' }),
})

// api/endpoints/users.ts
import { API } from '../index'
import { userSchema } from '../schemas'

export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

export const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().optional(),
    limit: z.number().optional(),
  }),
  responseSchema: z.array(userSchema),
})

// api/endpoints/posts.ts
import { API } from '../index'
import { postSchema } from '../schemas'

export const getPost = API.declareEndpoint({
  method: 'GET',
  url: '/posts/$postId',
  responseSchema: postSchema,
})
```

### Group by Resource

Organize endpoints by resource:

```
api/
  endpoints/
    users.ts
    posts.ts
    comments.ts
  schemas/
    user.ts
    post.ts
    comment.ts
  index.ts
```

## Schema Management

### Reuse Base Schemas

```typescript
// ✅ Good - reuse base schema
const baseUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
})

const createUserSchema = baseUserSchema.omit({ id: true, createdAt: true })
const updateUserSchema = baseUserSchema.partial().omit({ id: true, createdAt: true })
const userResponseSchema = baseUserSchema

// ❌ Bad - duplicate schemas
const createUserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
})
const updateUserSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
})
```

### Use Descriptive Names

```typescript
// ✅ Good - descriptive names
const userCreateRequestSchema = z.object({ ... })
const userResponseSchema = z.object({ ... })
const userUpdateRequestSchema = z.object({ ... })

// ❌ Bad - unclear names
const schema1 = z.object({ ... })
const schema2 = z.object({ ... })
```

### Extract Types

```typescript
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

// Export both schema and type
export { userSchema }
export type User = z.output<typeof userSchema>
```

## Error Handling

### Report Failures in One Place

```typescript
// ✅ Good - centralized reporting via the onError hook
const API = builder({
  client,
  onError: (error) => {
    if (error.kind === 'aborted') return

    logError(error.toJSON())

    if (error.status === 401) {
      redirectToLogin()
    }
  },
})

// ❌ Bad - the same reporting in every function
async function fetchUser() {
  try {
    return await getUser({ urlParams: { userId: '123' } })
  } catch (error) {
    logError(error) // Duplicated everywhere
    throw error
  }
}
```

### Use `safe()` for Failures You Expect

```typescript
// ✅ Good - an expected failure is handled as a value
const result = await getUser.safe({ urlParams: { userId } })
if (!result.ok && result.error.status === 404) {
  return null
}

// ❌ Bad - try/catch around a single call just to inspect the error
try {
  return await getUser({ urlParams: { userId } })
} catch (error) {
  if (isEndpointError(error) && error.status === 404) return null
  throw error
}
```

### Declare `errorSchema` for Statuses You Act On

```typescript
const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: createUserSchema,
  responseSchema: userSchema,
  errorSchema: {
    409: z.object({ existingUserId: z.string() }),
    422: z.object({ fields: z.record(z.string(), z.string()) }),
  },
})

const result = await createUser.safe({ data })
if (!result.ok && result.error.kind === 'http' && result.error.status === 422) {
  showFieldErrors(result.error.body.fields) // typed
}
```

### Provide User-Friendly Messages

```typescript
import { isEndpointError } from '@navios/builder'

function getErrorMessage(error: unknown): string {
  if (!isEndpointError(error)) return 'An unexpected error occurred'

  switch (error.kind) {
    case 'request-validation':
      return 'Invalid request. Please check your input.'
    case 'network':
    case 'timeout':
      return 'Connection problem. Please try again.'
    case 'http':
    case 'http-unknown':
      if (error.status === 401) return 'You are not authorized. Please log in.'
      if (error.status === 404) return 'The requested resource was not found.'
      return 'Server error. Please try again later.'
    default:
      return 'An error occurred. Please try again.'
  }
}
```

## Type Safety

### Let TypeScript Infer Types

```typescript
// ✅ Good - let TypeScript infer
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

const user = await getUser({ urlParams: { userId: '123' } })
// user is automatically typed as z.output<typeof userSchema>

// ❌ Bad - unnecessary type annotations
const getUser = API.declareEndpoint<...>({ ... })
const user: User = await getUser({ urlParams: { userId: '123' } })
```

### Extract Parameter Types

```typescript
import type { EndpointErrorType, EndpointParams, EndpointResult } from '@navios/builder'

const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// Extract types for reuse
type GetUserParams = EndpointParams<typeof getUser>
type GetUserResponse = EndpointResult<typeof getUser>
type GetUserError = EndpointErrorType<typeof getUser>

// Use in other functions
function userLink(userId: GetUserParams['urlParams']['userId']): string {
  return `/users/${userId}`
}
```

## HTTP Client Configuration

### Single Client Instance

```typescript
// ✅ Good - single client instance
const client = create({ baseURL: 'https://api.example.com' })
const API = builder({ client })

// ❌ Bad - creating new client for each request
function getClient() {
  return create({ baseURL: 'https://api.example.com' })
}
```

### Per-Request Clients on the Server

```typescript
// ✅ Good - the client is scoped to one call
const user = await getUser({ urlParams: { userId } }, { client: requestClient })

// ❌ Bad - replacing the shared client while other requests are in flight
API.provideClient(requestClient)
const user = await getUser({ urlParams: { userId } })
```

### Configure Interceptors

```typescript
// ✅ Good - use interceptors for cross-cutting concerns
const client = create({
  baseURL: 'https://api.example.com',
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

const API = builder({ client })

// ❌ Bad - adding headers in every endpoint call
const user = await getUser({
  urlParams: { userId: '123' },
  headers: { Authorization: `Bearer ${token}` },
})
```

## URL Parameters

### Use Descriptive Names

```typescript
// ✅ Good - clear parameter names
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// ❌ Bad - unclear names
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: userSchema,
})
```

### Keep URLs RESTful

```typescript
// ✅ Good - RESTful URLs
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

const updateUser = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: userUpdateSchema,
  responseSchema: userSchema,
})

// ❌ Bad - non-RESTful URLs
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/getUser/$userId',
  responseSchema: userSchema,
})
```

## Query Parameters

### Provide Defaults

```typescript
// ✅ Good - sensible defaults
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().default(1),
    limit: z.number().default(20),
  }),
  responseSchema: z.array(userSchema),
})

// ❌ Bad - no defaults
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number(), // Required, but should be optional with default
    limit: z.number(), // Required, but should be optional with default
  }),
  responseSchema: z.array(userSchema),
})
```

### Validate Ranges

```typescript
// ✅ Good - validate input ranges
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
  }),
  responseSchema: z.array(userSchema),
})
```

## Performance

### Avoid Unnecessary Requests

```typescript
// ✅ Good - cache results
let cachedUser: User | null = null

async function getUserCached(userId: string) {
  if (cachedUser && cachedUser.id === userId) {
    return cachedUser
  }
  cachedUser = await getUser({ urlParams: { userId } })
  return cachedUser
}

// ❌ Bad - always making requests
async function getUserAlways(userId: string) {
  return await getUser({ urlParams: { userId } })
}
```

### Use AbortSignal for Cancellation

```typescript
// ✅ Good - support cancellation
const controller = new AbortController()

getUser({
  urlParams: { userId: '123' },
  signal: controller.signal,
})

// Cancel if needed
controller.abort()
```

## Testing

### Use a Fake Client

A client is an object with a `request` method, so tests need no mocking library for the transport. Pass a fake client per call and the full pipeline — URL binding, validation, error classification — runs for real:

```typescript
import type { Client } from '@navios/builder'

function fakeClient(status: number, data: unknown): Client {
  return {
    request: async () => ({ data: data as never, status, statusText: '', headers: {} }),
  }
}

it('returns the user', async () => {
  const client = fakeClient(200, { id: '123', name: 'John', email: 'john@example.com' })

  const user = await getUser({ urlParams: { userId: '123' } }, { client })

  expect(user.name).toBe('John')
})
```

### Test Error Cases

```typescript
it('reports a 404', async () => {
  const client = fakeClient(404, { message: 'Not found' })

  const result = await getUser.safe({ urlParams: { userId: '123' } }, { client })

  expect(result.ok).toBe(false)
  expect(result.error?.kind).toBe('http-unknown')
  expect(result.error?.status).toBe(404)
})
```

## Documentation

### Document Complex Schemas

```typescript
/**
 * User schema for API responses
 * 
 * @property id - Unique user identifier (UUID)
 * @property name - User's full name
 * @property email - User's email address (validated)
 * @property createdAt - ISO 8601 datetime string
 */
const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
})
```

### Document Endpoint Purpose

```typescript
/**
 * Retrieves a user by ID
 * 
 * @param userId - The unique identifier of the user
 * @returns User object with id, name, email, and createdAt
 * @throws NaviosError if user is not found (404)
 */
export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})
```

## Common Patterns

### CRUD Operations

```typescript
// Create
const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: userSchema.omit({ id: true, createdAt: true }),
  responseSchema: userSchema,
})

// Read
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// Update
const updateUser = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: userSchema.partial().omit({ id: true, createdAt: true }),
  responseSchema: userSchema,
})

// Delete
const deleteUser = API.declareEndpoint({
  method: 'DELETE',
  url: '/users/$userId',
  response: 'void',
})
```

### Pagination

```typescript
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  responseSchema: z.object({
    users: z.array(userSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
  }),
})
```

## Next Steps

- [Getting Started](/docs/builder/builder/getting-started) - Quick start guide
- [Defining Endpoints](/docs/builder/builder/guides/defining-endpoints) - Learn about endpoints
- [API Reference](/docs/builder/builder/api-reference) - Complete API documentation

