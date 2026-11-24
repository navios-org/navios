---
sidebar_position: 1
---

# Defining Endpoints

Endpoints are the core building blocks of your API client. This guide covers everything you need to know about declaring and using endpoints with `@navios/builder`.

## Basic Endpoint Declaration

The simplest endpoint is a GET request with a response schema:

```typescript
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { z } from 'zod'

const API = builder({
  client: create({ baseURL: 'https://api.example.com' }),
})

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
  response: 'void', // 204 No Content
})

// Usage
await deleteUser({ urlParams: { userId: '123' } })
```

### HEAD, OPTIONS

```typescript
const checkUser = API.declareEndpoint({
  method: 'HEAD',
  url: '/users/$userId',
  response: 'void', // HEAD responses have no body
})
```

## Endpoint Configuration

### Required Fields

- **`method`**: HTTP method (`'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'`)
- **`url`**: Endpoint URL (supports `$paramName` syntax for URL parameters)
- **`responseSchema`**: Schema for validating and typing a JSON response. Required unless the endpoint declares per-status [`responses`](#per-status-responses) or sets `response` to a non-JSON kind

### Optional Fields

- **`requestSchema`**: Schema for the request body
- **`querySchema`**: Object schema for query parameters
- **`urlParamsSchema`**: Object schema for runtime validation of URL parameters
- **`errorSchema`**: Map of HTTP status codes to schemas for typed error bodies
- **`responses`**: Map of success status codes to schemas, for endpoints whose 2xx replies differ by status. Takes the place of `responseSchema`
- **`body`**: `'json'` (default) or `'multipart'`
- **`response`**: `'json'` (default), `'blob'`, `'text'`, `'stream'` or `'void'`
- **`headers`**: Headers sent with every call
- **`timeout`**: Timeout in milliseconds
- **`clientOptions`**: Options specific to your HTTP client
- **`validateResponse`**: Set to `false` to skip the runtime parse of the response

The examples use Zod. A schema can come from any library that implements Standard Schema (Zod, Valibot, ArkType, ...) — see [Other Schema Libraries](/docs/builder/builder/guides/schemas#other-schema-libraries).

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

Declare a `requestSchema` to send a request body:

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

The `data` field is validated against your `requestSchema` before anything is sent. Invalid data fails the call with an `EndpointError` of kind `request-validation`.

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

## Calling an Endpoint

An endpoint is a function. Its argument object carries whatever the declaration asks for, plus per-call request options:

- `urlParams` - values for the `$paramName` placeholders
- `params` - query parameters (with `querySchema`)
- `data` - request body (with `requestSchema`)
- `headers` - merged over the endpoint's `headers`
- `timeout` - wins over the endpoint's `timeout`
- `signal` - an `AbortSignal` for cancellation

The argument object is optional when nothing in it is required, and `params` / `data` are optional when their schema has no required fields:

```typescript
const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({ page: z.number().optional() }),
  responseSchema: z.array(userSchema),
})

await getUsers()
await getUsers({ params: { page: 2 } })
await getUsers({ signal: controller.signal, timeout: 5000 })
```

### Throwing and Safe Calls

Calling the endpoint resolves to the data and throws an `EndpointError` on any failure. `safe()` takes the same arguments, never throws, and resolves to a result object instead:

```typescript
// Throws on failure
const user = await getUser({ urlParams: { userId: '123' } })

// Returns the failure
const result = await getUser.safe({ urlParams: { userId: '123' } })
if (result.ok) {
  console.log(result.data.name, result.response.status)
} else {
  console.error(result.error.kind)
}
```

See [Error Handling](/docs/builder/builder/guides/error-handling) for the error model.

### Per-Call Client

A second argument selects the HTTP client for one call:

```typescript
const user = await getUser({ urlParams: { userId: '123' } }, { client: requestClient })
```

See [HTTP Client Setup](/docs/builder/builder/guides/http-client#per-call) for when to use it.

## Response Validation

JSON responses are validated against `responseSchema` before your code sees them. A body that does not match fails the call with an `EndpointError` of kind `response-validation`:

```typescript
const result = await getUser.safe({ urlParams: { userId: '123' } })

if (result.ok) {
  // result.data is guaranteed to match userSchema
} else if (result.error.kind === 'response-validation') {
  console.error('Unexpected response shape:', result.error.issues)
}
```

For high-volume reads against a server you trust, `validateResponse: false` skips the runtime parse. The call then resolves to the body as the server sent it, so the result is typed as the schema's input (no transforms or defaults applied):

```typescript
const listFeedItems = API.declareEndpoint({
  method: 'GET',
  url: '/feed',
  responseSchema: feedItemsSchema,
  validateResponse: false,
})
```

## Per-Status Responses

Some endpoints answer with a different body depending on the success status: `200` with the existing resource, `201` with a creation receipt, `204` with nothing. Declare them with `responses` in place of `responseSchema`:

```typescript
const existingUserSchema = z.object({ id: z.string(), name: z.string() })
const createdUserSchema = z.object({ id: z.string(), created: z.literal(true) })

const saveUser = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: z.object({ name: z.string() }),
  responses: {
    200: existingUserSchema, // the user existed and was updated
    201: createdUserSchema, // the user was created
    204: null, // nothing to return
  },
})
```

- A schema validates and types the body for that status.
- `null` marks a status without a body; the call resolves to `undefined`.
- The result type is the union of every entry.
- A 2xx status that is not listed fails the call with an `EndpointError` of kind `response-validation`, as does a body that does not match the schema of its status.

```typescript
const data = await saveUser({ urlParams: { userId: '123' }, data: { name: 'Ada' } })
// { id: string; name: string } | { id: string; created: true } | undefined
```

The union says what can come back, not which status did. To tell the cases apart, call `safe()` and read `result.response.status`:

```typescript
const result = await saveUser.safe({ urlParams: { userId: '123' }, data: { name: 'Ada' } })

if (result.ok) {
  switch (result.response.status) {
    case 201:
      showToast('User created')
      break
    case 204:
      // result.data is undefined
      break
    default:
      // 200
      break
  }
}
```

The status is not linked to `result.data` in the type system. Narrow the value itself where you need its fields:

```typescript
if (result.ok && result.data && 'created' in result.data) {
  result.data.created // true
}
```

`responses` applies to JSON endpoints (the default `response` kind). Non-2xx statuses are still described by [`errorSchema`](/docs/builder/builder/guides/error-handling#typed-error-bodies-with-errorschema).

## Response Kinds

The `response` option selects what the endpoint resolves to. `responseSchema` is used for `'json'` only.

| `response`         | Resolves to                  | Typical use              |
| ------------------ | ---------------------------- | ------------------------ |
| `'json'` (default) | `z.output<responseSchema>`   | Regular API calls        |
| `'blob'`           | `Blob`                       | File downloads           |
| `'text'`           | `string`                     | Plain text, CSV, HTML    |
| `'stream'`         | `ReadableStream<Uint8Array>` | Large or incremental data |
| `'void'`           | `undefined`                  | 204 and other empty replies |

```typescript
const downloadFile = API.declareEndpoint({
  method: 'GET',
  url: '/files/$fileId/download',
  response: 'blob',
})

const blob = await downloadFile({ urlParams: { fileId: '123' } })
```

See [Non-JSON Responses](/docs/builder/builder/advanced/streams) for downloads and streaming.

## Multipart Bodies

`body: 'multipart'` sends `data` as `multipart/form-data`:

```typescript
const uploadAvatar = API.declareEndpoint({
  method: 'POST',
  url: '/users/$userId/avatar',
  body: 'multipart',
  requestSchema: z.object({ file: z.instanceof(File) }),
  responseSchema: z.object({ url: z.string() }),
})
```

See [Multipart Uploads](/docs/builder/builder/advanced/multipart) for details.

## Headers and Timeout

```typescript
const exportReport = API.declareEndpoint({
  method: 'POST',
  url: '/reports/export',
  requestSchema: exportRequestSchema,
  responseSchema: reportSchema,
  headers: { 'X-Feature': 'reports' },
  timeout: 30000,
})

// Per-call values win
await exportReport({ data: { format: 'csv' }, timeout: 60000 })
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

