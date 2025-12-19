---
sidebar_position: 1
---

# Defining Endpoints

Endpoints are the core building blocks of your API client. This guide covers everything you need to know about declaring and using endpoints with `@navios/builder`.

## Basic Endpoint Declaration

The simplest endpoint is a GET request with a response schema:

```typescript
import { builder } from '@navios/builder'
import { z } from 'zod'

const API = builder()

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
})

// Declare a GET endpoint
export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// Use it
const user = await getUser({ urlParams: { userId: '123' } })
```

## HTTP Methods

Builder supports all standard HTTP methods:

### GET - Retrieve Data

```typescript
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})
```

### POST - Create Resources

```typescript
const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  responseSchema: userSchema,
})

// Usage
const newUser = await createUser({
  data: { name: 'John', email: 'john@example.com' },
})
```

### PUT - Update Resources

```typescript
const updateUser = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
  }),
  responseSchema: userSchema,
})

// Usage
const updated = await updateUser({
  urlParams: { userId: '123' },
  data: { name: 'Jane' },
})
```

### PATCH - Partial Updates

```typescript
const patchUser = API.declareEndpoint({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: z.object({
    name: z.string().optional(),
  }),
  responseSchema: userSchema,
})
```

### DELETE - Remove Resources

```typescript
const deleteUser = API.declareEndpoint({
  method: 'DELETE',
  url: '/users/$userId',
  responseSchema: z.object({ success: z.boolean() }),
})

// Usage
await deleteUser({ urlParams: { userId: '123' } })
```

### HEAD, OPTIONS

```typescript
const checkUser = API.declareEndpoint({
  method: 'HEAD',
  url: '/users/$userId',
  responseSchema: z.any(), // HEAD requests typically don't have bodies
})
```

## Endpoint Configuration

### Required Fields

- **`method`**: HTTP method (`'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'`)
- **`url`**: Endpoint URL (supports `$paramName` syntax for URL parameters)
- **`responseSchema`**: Zod schema for validating and typing the response

### Optional Fields

- **`requestSchema`**: Zod schema for request body (required for POST, PUT, PATCH)
- **`querySchema`**: Zod schema for query parameters

## URL Structure

URLs can include path parameters using `$paramName` syntax:

```typescript
// Single parameter
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// Multiple parameters
const getUserPost = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId/posts/$postId',
  responseSchema: postSchema,
})

// Usage
const post = await getUserPost({
  urlParams: {
    userId: '123',
    postId: '456',
  },
})
```

:::tip
URL parameters are automatically extracted and typed. TypeScript will enforce that you provide all required parameters.
:::

See [URL Parameters](/docs/builder/builder/guides/url-parameters) for more details.

## Request Bodies

For POST, PUT, and PATCH methods, you can include a request body:

```typescript
const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({
    name: z.string(),
    email: z.string().email(),
    age: z.number().optional(),
  }),
  responseSchema: userSchema,
})

// Usage
const user = await createUser({
  data: {
    name: 'John Doe',
    email: 'john@example.com',
    age: 30,
  },
})
```

The `data` field is automatically validated against your `requestSchema` before sending.

## Query Parameters

Add query string parameters using `querySchema`:

```typescript
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().optional(),
    limit: z.number().min(1).max(100).optional(),
    search: z.string().optional(),
  }),
  responseSchema: z.array(userSchema),
})

// Usage
const users = await getUsers({
  params: {
    page: 1,
    limit: 20,
    search: 'john',
  },
})
```

See [Query Parameters](/docs/builder/builder/guides/query-parameters) for more details.

## Combining All Options

You can combine URL parameters, query parameters, and request bodies:

```typescript
const updateUserSettings = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId/settings',
  querySchema: z.object({
    notify: z.boolean().optional(),
  }),
  requestSchema: z.object({
    theme: z.enum(['light', 'dark']),
    language: z.string(),
  }),
  responseSchema: settingsSchema,
})

// Usage
const settings = await updateUserSettings({
  urlParams: { userId: '123' },
  params: { notify: true },
  data: {
    theme: 'dark',
    language: 'en',
  },
})
```

## Response Validation

All responses are automatically validated against your `responseSchema`:

```typescript
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// If the API returns invalid data, a ZodError is thrown
try {
  const user = await getUser({ urlParams: { userId: '123' } })
  // user is guaranteed to match userSchema
} catch (error) {
  if (error instanceof ZodError) {
    console.error('Invalid response format:', error.errors)
  }
}
```

## Type Inference

TypeScript automatically infers types from your schemas:

```typescript
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// Return type is inferred as z.output<typeof userSchema>
const user = await getUser({ urlParams: { userId: '123' } })
// user: { id: string; name: string; email: string }
```

## Endpoint Configuration Access

Each endpoint exposes its configuration:

```typescript
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

console.log(getUser.config)
// {
//   method: 'GET',
//   url: '/users/$userId',
//   responseSchema: ZodObject { ... }
// }
```

This is useful for introspection and advanced use cases.

## Common Patterns

### Reusing Schemas

```typescript
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

// Use the full schema for responses
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// Omit fields for creation
const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: userSchema.omit({ id: true }),
  responseSchema: userSchema,
})

// Make fields optional for updates
const updateUser = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: userSchema.partial().omit({ id: true }),
  responseSchema: userSchema,
})
```

### Array Responses

```typescript
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  responseSchema: z.array(userSchema),
})
```

### Nested Objects

```typescript
const getUserWithPosts = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema.extend({
    posts: z.array(z.object({
      id: z.string(),
      title: z.string(),
      content: z.string(),
    })),
  }),
})
```

## Next Steps

- [URL Parameters](/docs/builder/builder/guides/url-parameters) - Deep dive into URL parameter handling
- [Query Parameters](/docs/builder/builder/guides/query-parameters) - Learn about query string parameters
- [Request & Response Schemas](/docs/builder/builder/guides/schemas) - Master Zod schema patterns
- [Error Handling](/docs/builder/builder/guides/error-handling) - Handle errors gracefully

