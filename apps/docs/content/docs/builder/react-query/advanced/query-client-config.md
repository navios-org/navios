---
sidebar_position: 2
---

# Client Configuration

`declareClient` takes the builder whose endpoints the client uses and optional key defaults applied to every query and mutation it creates.

```typescript
const client = declareClient({
  api,
  defaults: {
    keyPrefix: ['api', 'v1'],
    keySuffix: ['cache'],
  },
})
```

## Key Prefix

Segments placed before the endpoint's `[method, url]` in every key:

```typescript
const client = declareClient({
  api,
  defaults: { keyPrefix: ['api', 'v1'] },
})

const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

getUser.key({ urlParams: { userId: '123' } })
// ['api', 'v1', 'GET', '/users/$userId', { urlParams: { userId: '123' } }]
```

## Key Suffix

Segments placed right after `[method, url]`, before the inputs:

```typescript
const client = declareClient({
  api,
  defaults: { keySuffix: ['cache'] },
})

getUser.key({ urlParams: { userId: '123' } })
// ['GET', '/users/$userId', 'cache', { urlParams: { userId: '123' } }]
```

## Per Declaration

A single query, infinite query or mutation can set its own `keyPrefix` / `keySuffix`. Each one replaces the client default of the same name:

```typescript
// Inline declaration
const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  keyPrefix: ['tenant-1'],
})

// Existing endpoint
const getUser = client.query(getUserEndpoint, { keyPrefix: ['tenant-1'] })
```

Mutation keys follow the same rule: `[...keyPrefix, method, url, ...keySuffix]`.

## Use Cases

### Several APIs in One Cache

Two clients for two backends can declare the same method and URL. A prefix keeps their entries apart:

```typescript
const billing = declareClient({ api: billingApi, defaults: { keyPrefix: ['billing'] } })
const accounts = declareClient({ api: accountsApi, defaults: { keyPrefix: ['accounts'] } })
```

### Clearing a Namespace

A shared prefix addresses everything a client cached:

```typescript
await queryClient.invalidateQueries({ queryKey: ['billing'] })
queryClient.removeQueries({ queryKey: ['accounts'] })
```

### Versioning Cached Shapes

When a response shape changes and the cache is persisted, change the suffix so old entries are not read:

```typescript
const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchemaV2,
  keySuffix: ['v2'],
})
```

## QueryClient Defaults

Defaults for TanStack options (`staleTime`, `retry`, ...) are set on the `QueryClient` as usual. Since every failure is an `EndpointError`, a retry policy can look at its kind:

```typescript
import { isEndpointError } from '@navios/builder'
import { QueryClient } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        if (!isEndpointError(error)) return false
        // Retry only failures that may be transient
        const transient =
          error.kind === 'network' ||
          error.kind === 'timeout' ||
          (error.status !== undefined && error.status >= 500)
        return transient && failureCount < 3
      },
    },
  },
})
```

## Next Steps

- [Query Keys](/docs/builder/react-query/guides/query-keys) - Understand query key structure
- [Getting Started](/docs/builder/react-query/getting-started) - Basic setup
