---
sidebar_position: 1
---

# @navios/http

A lightweight, fetch-based HTTP client that serves as a modern alternative to axios. Built on native `fetch` API for consistency across browsers and Node.js.

## Why @navios/http?

`axios` is a great library, but it has some limitations:

- Large bundle size
- Uses `XMLHttpRequest` on browsers and `http` on Node.js, causing inconsistencies
- Slow on Node.js
- Doesn't support Next.js caching mechanism

`@navios/http` solves these issues by:

- Being lightweight and focused
- Using native `fetch` API everywhere for consistency
- Supporting Next.js caching and React Server Components
- Providing a familiar API similar to `axios`

## Installation

```bash
npm install @navios/http
# or
yarn add @navios/http
```

## Quick Start

### Basic Usage

```typescript
import { create } from '@navios/http'

const client = create({
  baseURL: 'https://api.example.com',
})

const response = await client.get('/users')
console.log(response.data)
```

### With Interceptors

```typescript
import { create } from '@navios/http'

const client = create({
  baseURL: 'https://api.example.com/api/',
  headers: {
    'X-Custom-Header': 'foobar',
  },
})

// Request interceptor
client.interceptors.request.use((config) => {
  console.log('Request to', config.url)
  return config
})

// Response interceptor
client.interceptors.response.use(
  (response) => {
    console.log('Response from', response.config.url)
    return response
  },
  (error) => {
    console.error('Error from', error.config?.url)
    if (error.response?.status === 401) {
      console.error('Unauthorized')
    }
    return Promise.reject(error)
  },
)

const response = await client.get('users')
console.log(response.data)
```

## Integration with @navios/builder

`@navios/http` works seamlessly with `@navios/builder` to create type-safe API clients:

```typescript
import { builder } from '@navios/builder'
import { create } from '@navios/http'

import { z } from 'zod/v4'

// Create the HTTP client
const client = create({
  baseURL: 'https://api.example.com',
  headers: {
    Authorization: 'Bearer token',
  },
})

// Create the API builder
const API = builder({
  useDiscriminatorResponse: true,
})

// Provide the client to the builder
API.provideClient(client)

// Define your endpoints with type safety
const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
  }),
})

// Use the endpoint with full type safety
const user = await getUser({ urlParams: { userId: '123' } })
console.log(user.name) // TypeScript knows this is a string
```

## API Reference

### `create(config)`

Creates a new HTTP client instance.

**Configuration Options:**

- `baseURL` - Base URL for all requests
- `headers` - Default headers for all requests
- `responseType` - Default response type: `json`, `text`, `blob`, `arrayBuffer`, `formData`, `stream`
- `validateStatus` - Custom function to validate status codes
- `adapter` - Custom adapter function (e.g., `fetch` from `undici`)
- `FormData` - Custom `FormData` implementation
- `URLSearchParams` - Custom `URLSearchParams` implementation

### Request Methods

#### `client.get(url[, config])`

Make a GET request.

```typescript
const response = await client.get('/users', {
  params: { page: 1, limit: 10 },
})
```

#### `client.post(url[, data[, config]])`

Make a POST request.

```typescript
const response = await client.post('/users', {
  name: 'John Doe',
  email: 'john@example.com',
})
```

#### `client.put(url[, data[, config]])`

Make a PUT request.

#### `client.patch(url[, data[, config]])`

Make a PATCH request.

#### `client.delete(url[, config])`

Make a DELETE request.

#### `client.head(url[, config])`

Make a HEAD request.

#### `client.options(url[, config])`

Make an OPTIONS request.

### Request Configuration

All request methods accept a configuration object:

```typescript
interface RequestConfig {
  url?: string // URL (combined with baseURL)
  method?: string // HTTP method
  headers?: Record<string, string> // Custom headers
  params?: Record<string, any> | URLSearchParams // Query parameters
  data?: any // Request body
  responseType?:
    | 'json'
    | 'text'
    | 'blob'
    | 'arrayBuffer'
    | 'formData'
    | 'stream'
  validateStatus?: (status: number) => boolean
  baseURL?: string // Override instance baseURL
  credentials?: 'omit' | 'same-origin' | 'include'
  signal?: AbortSignal // For request cancellation
  // ... other fetch RequestInit options
}
```

### Interceptors

#### Request Interceptors

```typescript
client.interceptors.request.use(
  (config) => {
    // Modify config before request
    config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => {
    // Handle request error
    return Promise.reject(error)
  },
)
```

#### Response Interceptors

```typescript
client.interceptors.response.use(
  (response) => {
    // Handle successful response
    return response
  },
  (error) => {
    // Handle error response
    if (error.response?.status === 401) {
      // Handle unauthorized
    }
    return Promise.reject(error)
  },
)
```

### Defaults

Modify default configuration:

```typescript
client.defaults.baseURL = 'https://new-api.example.com'
client.defaults.headers.common['Authorization'] = 'Bearer token'
client.defaults.headers.post['Content-Type'] = 'application/json'
```

## Next.js Integration

`@navios/http` uses native `fetch`, which means it automatically works with Next.js caching:

```typescript
import { create } from '@navios/http'

const client = create({
  baseURL: 'https://api.example.com',
})

// In a Server Component or API Route
export async function getUsers() {
  const response = await client.get('/users', {
    next: { revalidate: 3600 }, // Cache for 1 hour
  })
  return response.data
}
```

## Error Handling

```typescript
try {
  const response = await client.get('/users')
  console.log(response.data)
} catch (error) {
  if (error.response) {
    // Server responded with error status
    console.error('Status:', error.response.status)
    console.error('Data:', error.response.data)
  } else if (error.request) {
    // Request made but no response received
    console.error('No response received')
  } else {
    // Error setting up request
    console.error('Error:', error.message)
  }
}
```

## Request Cancellation

Use `AbortSignal` to cancel requests:

```typescript
const controller = new AbortController()

client
  .get('/users', {
    signal: controller.signal,
  })
  .catch((error) => {
    if (error.name === 'AbortError') {
      console.log('Request cancelled')
    }
  })

// Cancel the request
controller.abort()
```

## Best Practices

1. **Create a single client instance** and reuse it across your application
2. **Use interceptors** for common functionality like authentication
3. **Set default headers** for API keys or authentication tokens
4. **Handle errors appropriately** based on status codes
5. **Use TypeScript** with `@navios/builder` for type-safe API calls

## License

MIT
