---
sidebar_position: 1
---

# Getting Started

Get up and running with `@navios/builder` in minutes. This guide will walk you through installation, basic setup, and your first type-safe API endpoint.

## What is Builder?

Builder is a library for creating type-safe API clients and server endpoints. It uses Zod schemas to define API contracts, providing:

- **Type safety**: TypeScript types inferred from schemas
- **Runtime validation**: Automatic request/response validation
- **Client generation**: Type-safe HTTP clients from endpoint definitions
- **Flexibility**: Works with any HTTP client implementation

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

Builder follows a simple pattern: create a builder instance, declare endpoints with schemas, provide an HTTP client, and use the endpoints.

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

## How It Works

1. **Builder Instance**: `builder()` creates a new API builder that manages your endpoints and their types.

2. **Schema Definition**: Zod schemas define the shape of request and response data. These schemas provide both runtime validation and TypeScript types.

3. **Endpoint Declaration**: `declareEndpoint()` creates a typed function that makes HTTP requests. The function signature is inferred from your schemas.

4. **Client Setup**: `provideClient()` tells the builder which HTTP client to use for making requests.

5. **Type Safety**: TypeScript automatically infers types from your schemas, ensuring compile-time type checking and excellent IDE support.

## Next Steps

- [Defining Endpoints](/docs/builder/builder/guides/defining-endpoints) - Learn how to declare different types of endpoints
- [URL Parameters](/docs/builder/builder/guides/url-parameters) - Understand how `$paramName` syntax works
- [Query Parameters](/docs/builder/builder/guides/query-parameters) - Add query string parameters to your endpoints
- [Request & Response Schemas](/docs/builder/builder/guides/schemas) - Master Zod schema patterns
- [Error Handling](/docs/builder/builder/guides/error-handling) - Handle errors gracefully

## Need Help?

- Check the [Overview](/docs/builder/builder/overview) for core concepts
- Browse the [API Reference](/docs/builder/builder/api-reference) for detailed API docs
- See [Best Practices](/docs/builder/builder/best-practices) for tips and patterns
