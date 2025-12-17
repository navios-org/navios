# @navios/builder Specification

## Overview

`@navios/builder` is a type-safe HTTP API client builder for TypeScript. It provides a declarative way to define API endpoints with full Zod schema validation for requests, responses, and URL parameters.

**Package:** `@navios/builder`
**Version:** 0.4.0
**License:** MIT
**Peer Dependencies:** `zod` (^3.25.0 || ^4.0.0)

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

---

## API Reference

### `builder(config?: BuilderConfig): BuilderInstance`

Creates a new API builder instance.

```typescript
import { builder } from '@navios/builder'

const API = builder({
  useDiscriminatorResponse: true,
  onError: (error) => console.error(error),
})
```

#### BuilderConfig

| Property | Type | Description |
|----------|------|-------------|
| `useDiscriminatorResponse` | `boolean` | Parse error responses using the same schema (for discriminated unions) |
| `onError` | `(error: unknown) => void` | Global error callback |
| `onZodError` | `(error: ZodError, response?, originalError?) => void` | Zod validation error callback |

---

### BuilderInstance Methods

#### `declareEndpoint(options)`

Declares a typed HTTP endpoint for JSON responses.

```typescript
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
  }),
})

// Usage
const user = await getUser({ urlParams: { userId: '123' } })
```

**Overloads:**

1. **GET/DELETE/HEAD/OPTIONS (no body)**
   ```typescript
   declareEndpoint<Config extends { method: 'GET' | 'DELETE' | 'HEAD' | 'OPTIONS' }>({
     method: Config['method']
     url: string
     querySchema?: ZodType
     responseSchema: ZodType
   })
   ```

2. **POST/PUT/PATCH (with body)**
   ```typescript
   declareEndpoint<Config extends { method: 'POST' | 'PUT' | 'PATCH' }>({
     method: Config['method']
     url: string
     querySchema?: ZodType
     requestSchema?: ZodType
     responseSchema: ZodType
   })
   ```

#### `declareStream(options)`

Declares an endpoint that returns binary data (Blob).

```typescript
const downloadFile = API.declareStream({
  method: 'GET',
  url: '/files/$fileId/download',
})

// Usage
const blob = await downloadFile({ urlParams: { fileId: '123' } })
```

**Options:**

| Property | Type | Description |
|----------|------|-------------|
| `method` | `HttpMethod` | HTTP method |
| `url` | `string` | Endpoint URL (supports `$paramName` syntax) |
| `querySchema` | `ZodType` | Optional query parameters schema |
| `requestSchema` | `ZodType` | Optional request body schema |

**Returns:** `Promise<Blob>`

#### `declareMultipart(options)`

Declares an endpoint for multipart/form-data uploads.

```typescript
const uploadFile = API.declareMultipart({
  method: 'POST',
  url: '/files',
  requestSchema: z.object({
    file: z.instanceof(File),
    name: z.string(),
  }),
  responseSchema: z.object({
    id: z.string(),
    url: z.string(),
  }),
})

// Usage
const result = await uploadFile({
  data: {
    file: selectedFile,
    name: 'document.pdf',
  },
})
```

**Features:**
- Automatic FormData construction
- File object serialization
- Array field support
- Nested object handling

#### `provideClient(client: Client)`

Registers the HTTP client for making requests.

```typescript
import { create } from 'navios'

const client = create({ baseURL: 'https://api.example.com' })
API.provideClient(client)
```

#### `getClient(): Client`

Returns the registered HTTP client.

---

## URL Parameters

URL parameters are defined using `$paramName` syntax and automatically extracted:

```typescript
const endpoint = API.declareEndpoint({
  method: 'GET',
  url: '/organizations/$orgId/users/$userId',
  responseSchema: userSchema,
})

// TypeScript enforces both parameters
await endpoint({
  urlParams: {
    orgId: 'org-123',
    userId: 'user-456',
  },
})
```

### Type Extraction

The library extracts parameter names at the type level:

```typescript
type ParsePathParams<'/users/$userId/posts/$postId'> = 'userId' | 'postId'
```

---

## Request Arguments

### EndpointFunctionArgs

The generated endpoint function accepts an object with:

| Property | Type | Description |
|----------|------|-------------|
| `urlParams` | `Record<string, string>` | URL path parameters (if URL has `$params`) |
| `params` | `z.infer<QuerySchema>` | Query parameters (if `querySchema` defined) |
| `data` | `z.infer<RequestSchema>` | Request body (if `requestSchema` defined) |

```typescript
// Full example with all argument types
const updateUser = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  querySchema: z.object({ notify: z.boolean().optional() }),
  requestSchema: z.object({ name: z.string() }),
  responseSchema: userSchema,
})

await updateUser({
  urlParams: { userId: '123' },
  params: { notify: true },
  data: { name: 'John Doe' },
})
```

---

## Error Handling

### NaviosError

Custom error class for request failures.

```typescript
import { NaviosError } from '@navios/builder'

try {
  await endpoint()
} catch (error) {
  if (error instanceof NaviosError) {
    console.error(error.message)
    console.error(error.cause) // Original error
  }
}
```

### Discriminated Union Responses

Enable `useDiscriminatorResponse` to handle APIs that return different shapes for success/error:

```typescript
const API = builder({ useDiscriminatorResponse: true })

const responseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('success'), data: userSchema }),
  z.object({ status: z.literal('error'), message: z.string() }),
])

const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema,
})

const result = await getUser({ urlParams: { userId: '123' } })
if (result.status === 'success') {
  console.log(result.data) // Typed as User
} else {
  console.error(result.message) // Typed as string
}
```

### Error Callbacks

```typescript
const API = builder({
  onError: (error) => {
    // Called on any error
    reportToSentry(error)
  },
  onZodError: (zodError, response, originalError) => {
    // Called specifically on Zod validation failures
    console.error('Validation failed:', zodError.errors)
  },
})
```

---

## Advanced Usage

### Endpoint Configuration Access

Each declared endpoint exposes its configuration:

```typescript
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  responseSchema: z.array(userSchema),
})

console.log(getUsers.config)
// { method: 'GET', url: '/users', responseSchema: ... }
```

### Custom Handler Creation

For advanced use cases, use the low-level handler creation functions:

```typescript
import { createHandler, createEndpoint } from '@navios/builder'

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

### Request Configuration

Use `makeConfig` for manual request configuration:

```typescript
import { makeConfig, bindUrlParams } from '@navios/builder'

const config = makeConfig(
  { urlParams: { id: '123' }, data: { name: 'John' } },
  endpointOptions,
  'POST',
  '/users/$id'
)
```

---

## Client Interface

The builder works with any HTTP client implementing:

```typescript
interface Client {
  request<T>(config: AbstractRequestConfig): Promise<AbstractResponse<T>>
}

interface AbstractRequestConfig {
  method: string
  url: string
  data?: any
  params?: any
  headers?: Record<string, string>
  responseType?: 'json' | 'blob'
}

interface AbstractResponse<T> {
  data: T
  status: number
  headers: Record<string, string>
}
```

### Compatible Clients

- `navios` (recommended)
- `axios`
- Custom fetch wrappers

---

## TypeScript Types

### Exported Types

```typescript
// HTTP Methods
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

// Configuration types
type BaseEndpointConfig = {
  method: HttpMethod
  url: string
  querySchema?: ZodType
  requestSchema?: ZodType
  responseSchema: ZodType
}

type BaseStreamConfig = {
  method: HttpMethod
  url: string
  querySchema?: ZodType
  requestSchema?: ZodType
}

// Request argument types
type NaviosZodRequest<Config> = {
  urlParams?: Record<string, string>
  params?: z.infer<Config['querySchema']>
  data?: z.infer<Config['requestSchema']>
}

// Type utilities
type UrlParams<Url extends string>  // Extracts URL parameter object type
type UrlHasParams<Url extends string>  // Boolean check for URL parameters
```

---

## Integration with @navios/react-query

The builder integrates with TanStack Query through `@navios/react-query`:

```typescript
import { useQuery } from '@navios/react-query'
import { getUser } from './api'

function UserProfile({ userId }) {
  const { data, isLoading } = useQuery(getUser, {
    urlParams: { userId },
  })

  if (isLoading) return <Loading />
  return <div>{data.name}</div>
}
```

---

## Best Practices

### 1. Centralize API Definitions

```typescript
// api/endpoints/users.ts
export const getUser = API.declareEndpoint(...)
export const updateUser = API.declareEndpoint(...)

// api/index.ts
export * from './endpoints/users'
export { API }
```

### 2. Use Zod Schema Reuse

```typescript
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
})

const getUserResponse = userSchema
const listUsersResponse = z.array(userSchema)
const createUserRequest = userSchema.omit({ id: true })
```

### 3. Handle Errors Consistently

```typescript
const API = builder({
  onError: (error) => {
    if (error instanceof NaviosError) {
      toast.error(error.message)
    }
  },
})
```

### 4. Type Endpoint Parameters

```typescript
// Let TypeScript infer parameter types
const endpoint = API.declareEndpoint({...})
type EndpointArgs = Parameters<typeof endpoint>[0]
```
