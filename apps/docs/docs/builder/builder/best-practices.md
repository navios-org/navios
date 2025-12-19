---
sidebar_position: 6
---

# Best Practices

This guide covers best practices for using `@navios/builder` effectively in your projects.

## Organizing Endpoints

### Centralize API Definitions

Create a centralized API structure:

```typescript
// api/index.ts
import { builder } from '@navios/builder'
import { create } from '@navios/http'

export const API = builder()
API.provideClient(create({ baseURL: 'https://api.example.com' }))

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

### Use Global Error Handlers

```typescript
// ✅ Good - centralized error handling
const API = builder({
  onError: (error) => {
    logError(error)
    if (error instanceof NaviosError && error.cause) {
      const httpError = error.cause as { status?: number }
      if (httpError.status === 401) {
        redirectToLogin()
      }
    }
  },
  onZodError: (zodError) => {
    logValidationError(zodError)
    showUserFriendlyError('Invalid data received from server')
  },
})

// ❌ Bad - error handling in every function
async function fetchUser() {
  try {
    return await getUser({ urlParams: { userId: '123' } })
  } catch (error) {
    logError(error) // Duplicated everywhere
    if (error instanceof NaviosError) {
      if (error.cause?.status === 401) {
        redirectToLogin()
      }
    }
    throw error
  }
}
```

### Provide User-Friendly Messages

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
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// Extract types for reuse
type GetUserParams = Parameters<typeof getUser>[0]['urlParams']
type GetUserResponse = Awaited<ReturnType<typeof getUser>>

// Use in other functions
function validateUserId(userId: GetUserParams['userId']): boolean {
  return userId.length > 0
}
```

## HTTP Client Configuration

### Single Client Instance

```typescript
// ✅ Good - single client instance
const API = builder()
const client = create({ baseURL: 'https://api.example.com' })
API.provideClient(client)

// ❌ Bad - creating new client for each request
function getClient() {
  return create({ baseURL: 'https://api.example.com' })
}
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

API.provideClient(client)

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

### Mock Endpoints

```typescript
// In tests
const mockGetUser = vi.fn()
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// Mock the endpoint
vi.spyOn(API, 'declareEndpoint').mockReturnValue(mockGetUser)
```

### Test Error Cases

```typescript
it('handles 404 errors', async () => {
  const error = new NaviosError('Not found', { status: 404 })
  mockGetUser.mockRejectedValue(error)
  
  await expect(getUser({ urlParams: { userId: '123' } })).rejects.toThrow()
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
  responseSchema: z.object({ success: z.boolean() }),
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

