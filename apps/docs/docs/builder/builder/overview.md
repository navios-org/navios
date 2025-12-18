---
sidebar_position: 1
---

# @navios/builder

A type-safe HTTP API client builder for TypeScript. It provides a declarative way to define API endpoints with full Zod schema validation for requests, responses, and URL parameters.

**Package:** `@navios/builder`
**License:** MIT
**Peer Dependencies:** `zod` (^3.25.0 || ^4.0.0)

## Installation

```bash
npm install @navios/builder zod
# or
yarn add @navios/builder zod
# or
pnpm add @navios/builder zod
```

## Core Concepts

### Builder Pattern

The builder creates a centralized API definition that:
- Declares typed endpoints with request/response schemas
- Manages HTTP client lifecycle
- Handles error transformation and validation
- Supports multiple response types (JSON, streams, multipart)

### Type Safety

- URL parameters are extracted from `$paramName` syntax
- Request bodies are validated against Zod schemas
- Response data is validated and typed
- Query parameters support Zod schema validation

## Quick Start

```typescript
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { z } from 'zod'

// Create a builder instance
const API = builder()

// Define your schemas
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

// Declare endpoints
export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

export const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: userSchema.omit({ id: true }),
  responseSchema: userSchema,
})

// Provide the HTTP client
API.provideClient(create({ baseURL: 'https://api.example.com' }))

// Use the endpoints
const user = await getUser({ urlParams: { userId: '123' } })
const newUser = await createUser({ data: { name: 'John', email: 'john@example.com' } })
```

## API Reference

### `builder(config?: BuilderConfig)`

Creates a new API builder instance.

```typescript
const API = builder({
  useDiscriminatorResponse: true,
  onError: (error) => console.error(error),
})
```

#### BuilderConfig Options

| Property | Type | Description |
|----------|------|-------------|
| `useDiscriminatorResponse` | `boolean` | Parse error responses using the same schema (for discriminated unions) |
| `onError` | `(error: unknown) => void` | Global error callback |
| `onZodError` | `(error: ZodError, response?, originalError?) => void` | Zod validation error callback |

