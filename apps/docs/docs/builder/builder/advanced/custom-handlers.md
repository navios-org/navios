---
sidebar_position: 4
---

# Custom Handlers

For advanced use cases, Builder provides low-level handler creation functions that give you full control over request and response transformation.

## When to Use Custom Handlers

Use custom handlers when you need:
- Custom request/response transformation
- Special error handling logic
- Request/response interceptors
- Custom validation logic

For most use cases, the standard `declareEndpoint`, `declareStream`, and `declareMultipart` methods are sufficient.

## Low-Level API

### createHandler

The `createHandler` function provides full control:

```typescript
import { createHandler } from '@navios/builder'

const handler = createHandler({
  options: endpointConfig,
  context: builderContext,
  transformRequest: (request) => {
    // Modify request before sending
    return request
  },
  transformResponse: (data) => {
    // Transform response data
    return data
  },
})
```

### createEndpoint

Create a custom endpoint handler:

```typescript
import { createEndpoint } from '@navios/builder'

const customEndpoint = createEndpoint(
  endpointConfig,
  builderContext,
  {
    transformRequest: (request) => {
      // Custom request transformation
      return {
        ...request,
        headers: {
          ...request.headers,
          'X-Custom-Header': 'value',
        },
      }
    },
    transformResponse: (data) => {
      // Custom response transformation
      return {
        ...data,
        processedAt: new Date().toISOString(),
      }
    },
  }
)
```

## Request Transformation

### Adding Headers

```typescript
import { createEndpoint } from '@navios/builder'

const getUser = createEndpoint(
  {
    method: 'GET',
    url: '/users/$userId',
    responseSchema: userSchema,
  },
  builderContext,
  {
    transformRequest: (request) => {
      return {
        ...request,
        headers: {
          ...request.headers,
          'X-Request-ID': generateRequestId(),
          'X-Client-Version': '1.0.0',
        },
      }
    },
  }
)
```

### Modifying Request Body

```typescript
const createUser = createEndpoint(
  {
    method: 'POST',
    url: '/users',
    requestSchema: userCreateSchema,
    responseSchema: userSchema,
  },
  builderContext,
  {
    transformRequest: (request) => {
      return {
        ...request,
        data: {
          ...request.data,
          // Add server-side fields
          createdAt: new Date().toISOString(),
          source: 'web',
        },
      }
    },
  }
)
```

### Request Validation

```typescript
const createUser = createEndpoint(
  {
    method: 'POST',
    url: '/users',
    requestSchema: userCreateSchema,
    responseSchema: userSchema,
  },
  builderContext,
  {
    transformRequest: (request) => {
      // Additional validation
      if (request.data && 'email' in request.data) {
        const email = request.data.email as string
        if (!email.includes('@')) {
          throw new Error('Invalid email format')
        }
      }
      return request
    },
  }
)
```

## Response Transformation

### Data Normalization

```typescript
const getUser = createEndpoint(
  {
    method: 'GET',
    url: '/users/$userId',
    responseSchema: userSchema,
  },
  builderContext,
  {
    transformResponse: (data) => {
      // Normalize data structure
      return {
        ...data,
        // Convert snake_case to camelCase
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      }
    },
  }
)
```

### Adding Computed Fields

```typescript
const getUser = createEndpoint(
  {
    method: 'GET',
    url: '/users/$userId',
    responseSchema: userSchema,
  },
  builderContext,
  {
    transformResponse: (data) => {
      return {
        ...data,
        // Add computed fields
        displayName: `${data.firstName} ${data.lastName}`,
        isActive: data.status === 'active',
      }
    },
  }
)
```

### Data Enrichment

```typescript
const getUser = createEndpoint(
  {
    method: 'GET',
    url: '/users/$userId',
    responseSchema: userSchema,
  },
  builderContext,
  {
    transformResponse: async (data) => {
      // Enrich with additional data
      const profile = await fetchUserProfile(data.id)
      return {
        ...data,
        profile,
      }
    },
  }
)
```

## Error Transformation

### Custom Error Handling

```typescript
const getUser = createEndpoint(
  {
    method: 'GET',
    url: '/users/$userId',
    responseSchema: userSchema,
  },
  builderContext,
  {
    transformResponse: (data) => data,
    onError: (error) => {
      // Custom error handling
      if (error instanceof NaviosError) {
        // Transform error
        throw new CustomError(error.message, {
          originalError: error,
        })
      }
      throw error
    },
  }
)
```

## makeConfig

For manual request configuration:

```typescript
import { makeConfig, bindUrlParams } from '@navios/builder'

const config = makeConfig(
  { urlParams: { id: '123' }, data: { name: 'John' } },
  endpointOptions,
  'POST',
  '/users/$id'
)

// Use config with your HTTP client
const response = await client.request(config)
```

### bindUrlParams

Bind URL parameters to a URL pattern:

```typescript
import { bindUrlParams } from '@navios/builder'

const url = bindUrlParams('/users/$userId/posts/$postId', {
  userId: '123',
  postId: '456',
})
// Returns: '/users/123/posts/456'
```

## Complete Example

```typescript
import { builder, createEndpoint } from '@navios/builder'
import { create } from '@navios/http'
import { z } from 'zod'

const API = builder()
const client = create({ baseURL: 'https://api.example.com' })
API.provideClient(client)

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  created_at: z.string(), // API returns snake_case
})

// Custom endpoint with transformations
const getUser = createEndpoint(
  {
    method: 'GET',
    url: '/users/$userId',
    responseSchema: userSchema,
  },
  {
    getClient: () => API.getClient(),
    config: {},
  },
  {
    transformRequest: (request) => {
      // Add custom headers
      return {
        ...request,
        headers: {
          ...request.headers,
          'X-Request-ID': crypto.randomUUID(),
        },
      }
    },
    transformResponse: (data) => {
      // Transform snake_case to camelCase
      return {
        id: data.id,
        name: data.name,
        email: data.email,
        createdAt: data.created_at, // Convert to camelCase
      }
    },
  }
)

// Usage
const user = await getUser({ urlParams: { userId: '123' } })
// user.createdAt is available (transformed from created_at)
```

## Best Practices

### Use Standard Methods When Possible

```typescript
// ✅ Good - use standard method for simple cases
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// ❌ Overkill - custom handler not needed
const getUser = createEndpoint(/* ... */)
```

### Keep Transformations Simple

```typescript
// ✅ Good - simple transformation
transformResponse: (data) => ({
  ...data,
  displayName: `${data.firstName} ${data.lastName}`,
})

// ❌ Bad - complex logic in transformation
transformResponse: async (data) => {
  // Too much logic here
  const profile = await fetchProfile(data.id)
  const posts = await fetchPosts(data.id)
  const comments = await fetchComments(data.id)
  return { ...data, profile, posts, comments }
}
```

### Document Custom Logic

```typescript
/**
 * Custom endpoint that transforms API response from snake_case to camelCase
 * and adds a computed displayName field
 */
const getUser = createEndpoint(/* ... */)
```

## Next Steps

- [Defining Endpoints](/docs/builder/builder/guides/defining-endpoints) - Standard endpoint declaration
- [Request & Response Schemas](/docs/builder/builder/guides/schemas) - Schema patterns
- [Error Handling](/docs/builder/builder/guides/error-handling) - Error handling patterns

