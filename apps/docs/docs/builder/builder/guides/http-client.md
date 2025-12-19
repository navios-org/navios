---
sidebar_position: 6
---

# HTTP Client Setup

Builder works with any HTTP client that implements the `Client` interface. This guide covers setting up different HTTP clients and configuring them for your needs.

## Client Interface

Any HTTP client that implements this interface can be used with Builder:

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

const API = builder()

// Create and configure the client
const client = create({
  baseURL: 'https://api.example.com',
  headers: {
    'Content-Type': 'application/json',
  },
})

API.provideClient(client)
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

API.provideClient(client)
```

### Next.js Support

`@navios/http` has built-in support for Next.js caching:

```typescript
import { create } from '@navios/http'

const client = create({
  baseURL: 'https://api.example.com',
  // Next.js will automatically cache requests
})

API.provideClient(client)
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

const API = builder()

// Create axios instance
const client = axios.create({
  baseURL: 'https://api.example.com',
  headers: {
    'Content-Type': 'application/json',
  },
})

API.provideClient(client)
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

API.provideClient(client)
```

## Custom Client

You can create a custom client by implementing the `Client` interface:

```typescript
import { builder } from '@navios/builder'
import type { Client } from '@navios/builder'

class CustomClient implements Client {
  async request<T>(config: {
    method: string
    url: string
    data?: any
    params?: any
    headers?: Record<string, string>
    responseType?: 'json' | 'blob'
  }): Promise<{
    data: T
    status: number
    headers: Record<string, string>
  }> {
    // Implement your custom request logic
    const response = await fetch(config.url, {
      method: config.method,
      headers: config.headers,
      body: config.data ? JSON.stringify(config.data) : undefined,
    })
    
    const data = config.responseType === 'blob'
      ? await response.blob()
      : await response.json()
    
    return {
      data,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
    }
  }
}

const API = builder()
API.provideClient(new CustomClient())
```

## Client Lifecycle

### Providing the Client

You can provide the client at any time, but it must be provided before making requests:

```typescript
const API = builder()

// Provide client immediately
API.provideClient(create({ baseURL: 'https://api.example.com' }))

// Or provide it later
async function setupAPI() {
  const token = await getAuthToken()
  const client = create({
    baseURL: 'https://api.example.com',
    headers: { Authorization: `Bearer ${token}` },
  })
  API.provideClient(client)
}
```

### Getting the Client

You can retrieve the current client:

```typescript
const API = builder()
API.provideClient(create({ baseURL: 'https://api.example.com' }))

const client = API.getClient()
// Use client directly if needed
```

### Replacing the Client

You can replace the client at any time:

```typescript
const API = builder()

// Initial client
API.provideClient(create({ baseURL: 'https://api.example.com' }))

// Replace with new client (e.g., after authentication)
function updateClientWithToken(token: string) {
  const newClient = create({
    baseURL: 'https://api.example.com',
    headers: { Authorization: `Bearer ${token}` },
  })
  API.provideClient(newClient)
}
```

## Environment-Specific Configuration

### Development vs Production

```typescript
const API = builder()

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

API.provideClient(client)
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

const API = builder()
API.provideClient(getClient())
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

API.provideClient(client)
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

API.provideClient(client)
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

API.provideClient(client)
```

## Error Handling

### Global Error Handler

```typescript
const client = create({
  baseURL: 'https://api.example.com',
})

client.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle errors globally
    if (error.response) {
      switch (error.response.status) {
        case 401:
          // Unauthorized
          break
        case 403:
          // Forbidden
          break
        case 404:
          // Not found
          break
        case 500:
          // Server error
          break
      }
    }
    return Promise.reject(error)
  }
)

API.provideClient(client)
```

## Best Practices

### Single Client Instance

```typescript
// ✅ Good - single client instance
const API = builder()
const client = create({ baseURL: 'https://api.example.com' })
API.provideClient(client)

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
API.provideClient(client)

// ❌ Bad - reconfiguring for each request
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

