# HTTP Client Setup

Builder works with any HTTP client that implements the `Client` interface. This guide covers setting up different HTTP clients and configuring them for your needs.

## Client Interface

A client is an object with one method, `request`:

```typescript
interface Client {
  request<T = unknown>(config: AbstractRequestConfig): Promise<AbstractResponse<T>>
}

interface AbstractRequestConfig {
  method?: HttpMethod
  url: string // URL parameters already bound
  params?: Record<string, unknown> | URLSearchParams
  data?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal | null
  timeout?: number
  responseType?: 'json' | 'text' | 'blob' | 'arrayBuffer' | 'formData' | 'stream'
  [key: string]: unknown // keys from the endpoint's clientOptions
}

interface AbstractResponse<T> {
  data: T
  status: number
  statusText: string
  headers: Record<string, string> | Headers
}
```

### Contract

The builder, not the client, decides whether a call succeeded:

- `request` may **resolve or reject** for a non-2xx response. The builder checks `status` itself; anything outside 200–299 is an error.
- A rejection that carries a `response` property shaped like `AbstractResponse` (the axios / `@navios/http` convention) is handled exactly like a resolved non-2xx response.
- A rejection without `response` is a transport failure and is reported as `network`, `timeout` or `aborted`.

`responseType` is set from the endpoint's `response` option (`'blob'`, `'text'`, `'stream'`) and is absent for JSON endpoints. For `body: 'multipart'` endpoints, `data` is a `FormData` instance.

## @navios/http (Recommended)

`@navios/http` is a lightweight, fetch-based HTTP client designed for modern TypeScript applications.

### Installation

```bash
npm install @navios/http
```

### Basic Setup

```typescript
import { builder } from '@navios/builder'
import { create } from '@navios/http'

const client = create({
  baseURL: 'https://api.example.com',
  headers: {
    'Content-Type': 'application/json',
  },
})

const API = builder({ client })
```

### Advanced Configuration

```typescript
import { create } from '@navios/http'

const client = create({
  baseURL: 'https://api.example.com',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  timeout: 5000,
  // Interceptors
  interceptors: {
    request: [
      (config) => {
        // Modify request before sending
        config.headers['X-Request-ID'] = generateRequestId()
        return config
      },
    ],
    response: [
      (response) => {
        // Modify response
        return response
      },
      (error) => {
        // Handle errors
        return Promise.reject(error)
      },
    ],
  },
})

const API = builder({ client })
```

### Next.js Support

`@navios/http` has built-in support for Next.js caching:

```typescript
import { create } from '@navios/http'

const client = create({
  baseURL: 'https://api.example.com',
  // Next.js will automatically cache requests
})

const API = builder({ client })
```

## Axios

Axios is a popular HTTP client that works seamlessly with Builder.

### Installation

```bash
npm install axios
```

### Basic Setup

```typescript
import { builder } from '@navios/builder'
import axios from 'axios'

const client = axios.create({
  baseURL: 'https://api.example.com',
  headers: {
    'Content-Type': 'application/json',
  },
})

const API = builder({ client })
```

### With Interceptors

```typescript
import axios from 'axios'

const client = axios.create({
  baseURL: 'https://api.example.com',
})

// Request interceptor
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

const API = builder({ client })
```

## Custom Client

Because the builder checks the status itself, a thin `fetch` wrapper is a complete client — it does not need to throw on error statuses:

```typescript
import { builder } from '@navios/builder'

import type { AbstractRequestConfig, AbstractResponse, Client } from '@navios/builder'

const baseURL = 'https://api.example.com'

async function request<T>(config: AbstractRequestConfig): Promise<AbstractResponse<T>> {
  const query = new URLSearchParams(config.params as Record<string, string>).toString()
  const isFormData = config.data instanceof FormData

  const response = await fetch(`${baseURL}${config.url}${query ? `?${query}` : ''}`, {
    method: config.method,
    headers: isFormData
      ? config.headers
      : { 'Content-Type': 'application/json', ...config.headers },
    body:
      config.data === undefined
        ? undefined
        : isFormData
          ? (config.data as FormData)
          : JSON.stringify(config.data),
    signal: config.signal,
  })

  let data: unknown
  if (config.responseType === 'blob') data = await response.blob()
  else if (config.responseType === 'stream') data = response.body
  else if (config.responseType === 'text') data = await response.text()
  else data = await response.json().catch(() => null)

  return {
    data: data as T,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  }
}

const client: Client = { request }

const API = builder({ client })
```

:::tip
`fetch` has no `timeout` option. To honour `config.timeout`, pass `AbortSignal.timeout(config.timeout)` (combined with `config.signal` through `AbortSignal.any` when both are set). The builder reports the resulting `TimeoutError` as kind `timeout`.
:::

## Providing the Client

### At Creation

Pass the client when you create the builder:

```typescript
const API = builder({
  client: create({ baseURL: 'https://api.example.com' }),
})
```

### At Start-Up

When the client is not available where the endpoints are declared (for example in a shared contract package), create the builder without one and provide it when the application starts:

```typescript
// shared/api.ts
export const API = builder()

// app/main.ts
API.provideClient(create({ baseURL: 'https://api.example.com' }))
```

`provideClient` replaces the client for every endpoint declared on the builder. Calling an endpoint before a client is available fails with an `EndpointError` of kind `config`.

### Per Call

Pass `{ client }` as the second argument to use a client for one call only. The builder's shared client is not touched, which makes this the right tool for per-request clients on the server (forwarded cookies, per-user auth):

```typescript
export async function loadUser(request: Request, userId: string) {
  const client = create({
    baseURL: 'https://api.example.com',
    headers: { cookie: request.headers.get('cookie') ?? '' },
  })

  return getUser({ urlParams: { userId } }, { client })
}
```

`getUser.safe(args, { client })` accepts the same option.

### A Second Builder

`withClient` returns a new builder with the same configuration and a different client. Endpoints declared on the new builder use that client; endpoints already declared on the original are not affected:

```typescript
const API = builder({ client: publicClient, onError: reportError })
const adminAPI = API.withClient(adminClient)

const listAuditLog = adminAPI.declareEndpoint({
  method: 'GET',
  url: '/admin/audit-log',
  responseSchema: auditLogSchema,
})
```

### Getting the Client

```typescript
const client = API.getClient()
```

`getClient` throws a `NaviosError` when no client has been provided.

## Per-Endpoint Request Options

Headers, a timeout and client-specific options can be set on an endpoint:

```typescript
const exportReport = API.declareEndpoint({
  method: 'POST',
  url: '/reports/export',
  requestSchema: exportRequestSchema,
  responseSchema: reportSchema,
  headers: { 'X-Feature': 'reports' },
  timeout: 30000,
  clientOptions: { withCredentials: true },
})

// Per-call headers are merged over the endpoint's; a per-call timeout wins
await exportReport({
  data: { format: 'csv' },
  headers: { 'X-Trace-Id': traceId },
  timeout: 60000,
})
```

`clientOptions` is for keys only your HTTP client understands (axios `withCredentials`, fetch `credentials`, ...). They are merged into the request config under their own names. The keys the builder owns — `method`, `url`, `params`, `data`, `headers`, `signal`, `timeout`, `responseType` — cannot be overridden from `clientOptions`.

## Environment-Specific Configuration

### Development vs Production

```typescript
const baseURL = process.env.NODE_ENV === 'production'
  ? 'https://api.example.com'
  : 'http://localhost:3000'

const client = create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add debug logging in development
if (process.env.NODE_ENV === 'development') {
  client.interceptors.request.use((config) => {
    console.log('Request:', config)
    return config
  })
  
  client.interceptors.response.use(
    (response) => {
      console.log('Response:', response)
      return response
    }
  )
}

const API = builder({ client })
```

### Multiple Environments

```typescript
const getClient = () => {
  const env = process.env.API_ENV || 'development'
  
  const configs = {
    development: {
      baseURL: 'http://localhost:3000',
    },
    staging: {
      baseURL: 'https://staging-api.example.com',
    },
    production: {
      baseURL: 'https://api.example.com',
    },
  }
  
  return create(configs[env])
}

const API = builder({ client: getClient() })
```

## Authentication

### Bearer Token

```typescript
const client = create({
  baseURL: 'https://api.example.com',
  headers: {
    Authorization: `Bearer ${getToken()}`,
  },
})

const API = builder({ client })
```

### Dynamic Token

```typescript
const client = create({
  baseURL: 'https://api.example.com',
})

// Add token interceptor
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

const API = builder({ client })
```

### Token Refresh

```typescript
let isRefreshing = false
let refreshSubscribers: Array<(token: string) => void> = []

const client = create({
  baseURL: 'https://api.example.com',
})

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Wait for token refresh
        return new Promise((resolve) => {
          refreshSubscribers.push((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            resolve(client.request(originalRequest))
          })
        })
      }
      
      originalRequest._retry = true
      isRefreshing = true
      
      try {
        const newToken = await refreshToken()
        localStorage.setItem('token', newToken)
        
        refreshSubscribers.forEach((callback) => callback(newToken))
        refreshSubscribers = []
        
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return client.request(originalRequest)
      } catch (refreshError) {
        refreshSubscribers = []
        // Redirect to login
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }
    
    return Promise.reject(error)
  }
)

const API = builder({ client })
```

## Error Handling

Interceptors are a good place for transport concerns such as token refresh. For reporting and reacting to failures, prefer the builder's `onError` hook: it sees every failure — including validation failures that never reach the client — as a classified `EndpointError`:

```typescript
const API = builder({
  client,
  onError: (error) => {
    if (error.status === 401) {
      redirectToLogin()
    }
    logger.warn(error.toJSON())
  },
})
```

See [Error Handling](/docs/builder/builder/guides/error-handling) for details.

## Best Practices

### Single Client Instance

```typescript
// ✅ Good - single client instance
const client = create({ baseURL: 'https://api.example.com' })
const API = builder({ client })

// ❌ Bad - creating new client for each request
function getClient() {
  return create({ baseURL: 'https://api.example.com' })
}
```

### Configure Once

```typescript
// ✅ Good - configure once
const client = create({
  baseURL: 'https://api.example.com',
  headers: { 'Content-Type': 'application/json' },
})
const API = builder({ client })

// ❌ Bad - building a new client inside every function that calls an endpoint
```

### Use Interceptors

```typescript
// ✅ Good - use interceptors for cross-cutting concerns
client.interceptors.request.use((config) => {
  config.headers['X-Request-ID'] = generateRequestId()
  return config
})

// ❌ Bad - modifying config in every endpoint call
```

## Next Steps

- [Error Handling](/docs/builder/builder/guides/error-handling) - Handle errors from your HTTP client
- [Defining Endpoints](/docs/builder/builder/guides/defining-endpoints) - Declare endpoints that use your client
- [Best Practices](/docs/builder/builder/best-practices) - More client configuration patterns

