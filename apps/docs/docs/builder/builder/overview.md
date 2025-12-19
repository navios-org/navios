---
sidebar_position: 2
---

# Overview

`@navios/builder` is a type-safe HTTP API client builder for TypeScript. It provides a declarative way to define API endpoints with full Zod schema validation for requests, responses, and URL parameters.

**Package:** `@navios/builder`  
**License:** MIT  
**Peer Dependencies:** `zod` (^3.25.0 || ^4.0.0)

## Why Use Builder?

### Type Safety

Builder provides end-to-end type safety from your API definitions to your application code:

- **URL Parameters**: Automatically extracted and typed from `$paramName` syntax
- **Request Bodies**: Validated and typed using Zod schemas
- **Response Data**: Validated at runtime and typed at compile time
- **Query Parameters**: Full type safety with Zod validation

### Runtime Validation

All data is validated at runtime using Zod schemas:

- Invalid requests are caught before sending
- Invalid responses are caught and reported
- Type mismatches are detected early

### Declarative API

Define your API once in a clear, declarative way:

```typescript
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})
```

### Flexible HTTP Clients

Works with any HTTP client that implements the `Client` interface:

- `@navios/http` (recommended)
- `axios`
- Custom clients

### Error Handling

Comprehensive error handling with:

- Global error callbacks
- Zod validation error callbacks
- Discriminated union support for error responses
- Custom error transformation

## Core Concepts

### Builder Pattern

The builder creates a centralized API definition that:

- Declares typed endpoints with request/response schemas
- Manages HTTP client lifecycle
- Handles error transformation and validation
- Supports multiple response types (JSON, streams, multipart)

### Type Safety

- **URL Parameters**: Extracted from `$paramName` syntax and enforced at the type level
- **Request Bodies**: Validated against Zod schemas before sending
- **Response Data**: Validated and typed automatically
- **Query Parameters**: Full Zod schema validation support

### Schema Validation

All data flows through Zod schemas:

- Request validation ensures data matches expected shape
- Response validation catches API contract violations
- Type inference provides full TypeScript support

## Architecture

```
┌─────────────────┐
│   Your Code     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Endpoint Func   │  ← Typed function from declareEndpoint()
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Request Config  │  ← URL params, query params, body
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  HTTP Client     │  ← @navios/http, axios, or custom
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  API Response    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Zod Validation  │  ← Validates against responseSchema
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Typed Response  │  ← Fully typed and validated
└─────────────────┘
```

## Key Features

### URL Parameter Extraction

```typescript
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId/posts/$postId',
  responseSchema: postSchema,
})

// TypeScript enforces both parameters
await getUser({
  urlParams: {
    userId: '123',    // ✅ Required
    postId: '456',    // ✅ Required
  },
})
```

### Request/Response Validation

```typescript
const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
  responseSchema: userSchema,
})

// Request is validated before sending
// Response is validated after receiving
const user = await createUser({
  data: { name: 'John', email: 'john@example.com' },
})
```

### Multiple Response Types

```typescript
// JSON responses
const getUser = API.declareEndpoint({ ... })

// Binary/Blob responses
const downloadFile = API.declareStream({ ... })

// Multipart uploads
const uploadFile = API.declareMultipart({ ... })
```

### Error Handling

```typescript
const API = builder({
  onError: (error) => {
    // Global error handler
    logError(error)
  },
  onZodError: (zodError, response) => {
    // Zod validation errors
    logValidationError(zodError)
  },
})
```

## Quick Start

```typescript
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { z } from 'zod'

// 1. Create a builder instance
const API = builder()

// 2. Define your schemas
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

// 3. Declare endpoints
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

// 4. Provide the HTTP client
API.provideClient(create({ baseURL: 'https://api.example.com' }))

// 5. Use the endpoints
const user = await getUser({ urlParams: { userId: '123' } })
const newUser = await createUser({ data: { name: 'John', email: 'john@example.com' } })
```

## What's Next?

- [Getting Started](/docs/builder/builder/getting-started) - Installation and setup guide
- [Defining Endpoints](/docs/builder/builder/guides/defining-endpoints) - Learn how to declare endpoints
- [URL Parameters](/docs/builder/builder/guides/url-parameters) - Understand URL parameter handling
- [Request & Response Schemas](/docs/builder/builder/guides/schemas) - Master Zod schema patterns
- [Error Handling](/docs/builder/builder/guides/error-handling) - Handle errors gracefully
- [API Reference](/docs/builder/builder/api-reference) - Complete API documentation

