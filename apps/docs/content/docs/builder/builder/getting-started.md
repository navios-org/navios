# Getting Started

Get up and running with `@navios/builder` in minutes. This guide will walk you through installation, basic setup, and your first type-safe API endpoint.

## What is Builder?

Builder is a library for creating type-safe API clients and server endpoints. It uses schemas to define API contracts, providing:

- **Type safety**: TypeScript types inferred from schemas
- **Runtime validation**: Automatic request/response validation
- **Client generation**: Type-safe HTTP clients from endpoint definitions
- **Predictable errors**: One typed `EndpointError`, thrown or returned as a value
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
`zod` is an optional peer dependency: install it to follow these docs, which use Zod throughout. The builder itself does not import it, and endpoints accept schemas from any other [Standard Schema](https://standardschema.dev) library — see [Other Schema Libraries](/docs/builder/builder/guides/schemas#other-schema-libraries).
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

Builder follows a simple pattern: create a builder instance with an HTTP client, declare endpoints with schemas, and use the endpoints.

```typescript
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { z } from 'zod'

// 1. Create a builder instance with an HTTP client
const API = builder({
  client: create({ baseURL: 'https://api.example.com' }),
})

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

// 4. Use the endpoint
async function fetchUser() {
  const user = await getUser({ urlParams: { userId: '123' } })
  console.log(user.name) // TypeScript knows this is a string!
}
```

## Handling Failures

Calling an endpoint throws an `EndpointError` when anything goes wrong. Every endpoint also has a `safe()` twin that never throws and returns the outcome as a value:

```typescript
const result = await getUser.safe({ urlParams: { userId: '123' } })

if (result.ok) {
  console.log(result.data.name)
} else {
  // 'http' | 'http-unknown' | 'network' | 'timeout' | ...
  console.error(result.error.kind, result.error.status)
}
```

See [Error Handling](/docs/builder/builder/guides/error-handling) for the full picture.

## How It Works

1. **Builder Instance**: `builder({ client })` creates a new API builder that manages your endpoints and the HTTP client they use.

2. **Schema Definition**: Schemas (Zod, in these docs) define the shape of request and response data. These schemas provide both runtime validation and TypeScript types.

3. **Endpoint Declaration**: `declareEndpoint()` creates a typed function that makes HTTP requests. The function signature is inferred from your schemas.

4. **Calling**: `endpoint(args)` resolves to validated data and throws on failure; `endpoint.safe(args)` returns a result object instead.

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
