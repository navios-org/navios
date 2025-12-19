---
sidebar_position: 1
---

# Getting Started

Get up and running with `@navios/builder` in minutes. This guide will walk you through installation, basic setup, and your first type-safe API endpoint.

## Installation

```bash
npm install @navios/builder zod
# or
yarn add @navios/builder zod
# or
pnpm add @navios/builder zod
```

:::tip
`@navios/builder` requires `zod` as a peer dependency. Make sure you have it installed.
:::

## Choose Your HTTP Client

Builder works with any HTTP client that implements the `Client` interface. You have several options:

### @navios/http (Recommended)

A lightweight, fetch-based HTTP client designed for modern TypeScript applications.

```bash
npm install @navios/http
```

### Axios

The popular HTTP client library.

```bash
npm install axios
```

### Custom Client

You can use any client that implements the `Client` interface. See [HTTP Client Setup](/docs/builder/builder/guides/http-client) for details.

## Quick Start

Let's create a simple API client with a single endpoint:

```typescript
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { z } from 'zod'

// 1. Create a builder instance
const API = builder()

// 2. Define your data schemas
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

// 3. Declare your endpoints
export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// 4. Provide the HTTP client
API.provideClient(create({ baseURL: 'https://api.example.com' }))

// 5. Use the endpoint
async function fetchUser() {
  const user = await getUser({ urlParams: { userId: '123' } })
  console.log(user.name) // TypeScript knows this is a string!
}
```

That's it! You now have a fully type-safe API endpoint with automatic validation.

## What Just Happened?

1. **Builder Instance**: `builder()` creates a new API builder that will manage your endpoints
2. **Schema Definition**: We used Zod to define the shape of our user data
3. **Endpoint Declaration**: `declareEndpoint()` creates a typed function that makes HTTP requests
4. **Client Setup**: `provideClient()` tells the builder which HTTP client to use
5. **Type Safety**: TypeScript automatically infers the return type from your schema

## Next Steps

- [Defining Endpoints](/docs/builder/builder/guides/defining-endpoints) - Learn how to declare different types of endpoints
- [URL Parameters](/docs/builder/builder/guides/url-parameters) - Understand how `$paramName` syntax works
- [Query Parameters](/docs/builder/builder/guides/query-parameters) - Add query string parameters to your endpoints
- [Request & Response Schemas](/docs/builder/builder/guides/schemas) - Master Zod schema patterns
- [Error Handling](/docs/builder/builder/guides/error-handling) - Handle errors gracefully

## Example: Complete CRUD API

Here's a more complete example showing multiple endpoints:

```typescript
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { z } from 'zod'

const API = builder()

// Shared schema
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
})

// GET /users/$userId
export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// GET /users?page=1&limit=10
export const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().optional(),
    limit: z.number().optional(),
  }),
  responseSchema: z.object({
    users: z.array(userSchema),
    total: z.number(),
  }),
})

// POST /users
export const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: userSchema.omit({ id: true, createdAt: true }),
  responseSchema: userSchema,
})

// PUT /users/$userId
export const updateUser = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: userSchema.partial().omit({ id: true, createdAt: true }),
  responseSchema: userSchema,
})

// DELETE /users/$userId
export const deleteUser = API.declareEndpoint({
  method: 'DELETE',
  url: '/users/$userId',
  responseSchema: z.object({ success: z.boolean() }),
})

// Setup client
API.provideClient(create({ baseURL: 'https://api.example.com' }))

// Usage examples
async function example() {
  // Get a single user
  const user = await getUser({ urlParams: { userId: '123' } })
  
  // List users with pagination
  const { users, total } = await getUsers({ params: { page: 1, limit: 10 } })
  
  // Create a user
  const newUser = await createUser({
    data: { name: 'John Doe', email: 'john@example.com' },
  })
  
  // Update a user
  const updated = await updateUser({
    urlParams: { userId: '123' },
    data: { name: 'Jane Doe' },
  })
  
  // Delete a user
  await deleteUser({ urlParams: { userId: '123' } })
}
```

## Common Patterns

### Organizing Your API

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

// api/schemas/user.ts
import { z } from 'zod'

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})
```

### Error Handling

```typescript
const API = builder({
  onError: (error) => {
    console.error('API Error:', error)
    // Log to error tracking service
  },
  onZodError: (zodError, response) => {
    console.error('Validation failed:', zodError.errors)
    // Show user-friendly error message
  },
})
```

## Need Help?

- Check the [Overview](/docs/builder/builder/overview) for core concepts
- Browse the [API Reference](/docs/builder/builder/api-reference) for detailed API docs
- See [Best Practices](/docs/builder/builder/best-practices) for tips and patterns

