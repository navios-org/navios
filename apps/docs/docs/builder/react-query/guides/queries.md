---
sidebar_position: 1
---

# Queries

Queries are used to fetch data from your API. Builder's React Query integration provides type-safe hooks with automatic query key generation and cache management.

## Basic Query

Create a query with inline configuration:

```typescript
const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  processResponse: (data) => data,
})

// Use in component
function UserProfile({ userId }: { userId: string }) {
  const { data, isLoading, error } = getUser.use({
    urlParams: { userId },
  })

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  
  return <div>{data.name}</div>
}
```

## Query from Endpoint

Create a query from a pre-declared endpoint:

```typescript
// shared/endpoints/users.ts
import { builder } from '@navios/builder'

const API = builder()

export const getUserEndpoint = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})
```

```typescript
// client/queries/users.ts
import { client } from '../index'
import { getUserEndpoint } from '../../shared/endpoints/users'

const getUser = client.queryFromEndpoint(getUserEndpoint, {
  processResponse: (data) => data,
})

// Usage is the same
const { data } = getUser.use({ urlParams: { userId: '123' } })
```

## use() vs useSuspense()

### use() Hook

Returns a query result object with loading and error states:

```typescript
const { data, isLoading, error, refetch } = getUser.use({
  urlParams: { userId: '123' },
})

if (isLoading) return <div>Loading...</div>
if (error) return <div>Error: {error.message}</div>
return <div>{data.name}</div>
```

### useSuspense() Hook

Returns data directly and throws on error (requires Suspense boundary):

```typescript
function UserProfile({ userId }: { userId: string }) {
  const user = getUser.useSuspense({ urlParams: { userId } })
  // No loading/error checks needed - Suspense handles it
  return <div>{user.name}</div>
}

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ErrorBoundary fallback={<div>Error!</div>}>
        <UserProfile userId="123" />
      </ErrorBoundary>
    </Suspense>
  )
}
```

## Query Options

### Enabled

Conditionally enable/disable queries:

```typescript
const { data } = getUser.use({
  urlParams: { userId },
  enabled: !!userId, // Only fetch if userId exists
})
```

### Stale Time

Control how long data is considered fresh:

```typescript
const { data } = getUser.use({
  urlParams: { userId },
  staleTime: 5 * 60 * 1000, // 5 minutes
})
```

### Cache Time

Control how long unused data stays in cache:

```typescript
const { data } = getUser.use({
  urlParams: { userId },
  gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
})
```

### Refetch Options

```typescript
const { data } = getUser.use({
  urlParams: { userId },
  refetchOnWindowFocus: false,
  refetchOnMount: true,
  refetchOnReconnect: true,
})
```

## Query Parameters

### URL Parameters

```typescript
const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  processResponse: (data) => data,
})

const { data } = getUser.use({
  urlParams: { userId: '123' },
})
```

### Query String Parameters

```typescript
const getUsers = client.query({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().optional(),
    limit: z.number().optional(),
  }),
  responseSchema: z.array(userSchema),
  processResponse: (data) => data,
})

const { data } = getUsers.use({
  params: { page: 1, limit: 20 },
})
```

### Combined Parameters

```typescript
const getUserPosts = client.query({
  method: 'GET',
  url: '/users/$userId/posts',
  querySchema: z.object({
    page: z.number().optional(),
  }),
  responseSchema: z.array(postSchema),
  processResponse: (data) => data,
})

const { data } = getUserPosts.use({
  urlParams: { userId: '123' },
  params: { page: 1 },
})
```

## POST Queries

You can use POST for queries (useful for complex search):

```typescript
const searchUsers = client.query({
  method: 'POST',
  url: '/users/search',
  requestSchema: z.object({
    query: z.string(),
    filters: z.array(z.string()).optional(),
  }),
  responseSchema: z.array(userSchema),
  processResponse: (data) => data,
})

const { data } = searchUsers.use({
  data: {
    query: 'john',
    filters: ['active'],
  },
})
```

## processResponse

Transform response data:

```typescript
const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  processResponse: (data) => ({
    ...data,
    displayName: `${data.firstName} ${data.lastName}`,
    isActive: data.status === 'active',
  }),
})

// data includes displayName and isActive
const { data } = getUser.use({ urlParams: { userId: '123' } })
```

## Error Handling

### With use()

```typescript
const { data, error, isError } = getUser.use({
  urlParams: { userId: '123' },
})

if (isError) {
  if (error instanceof NaviosError) {
    console.error('API Error:', error.message)
  } else {
    console.error('Unknown error:', error)
  }
}
```

### With useSuspense()

Use ErrorBoundary:

```typescript
class QueryErrorBoundary extends React.Component {
  state = { hasError: false }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return <div>Error: {this.state.error.message}</div>
    }
    return this.props.children
  }
}

function App() {
  return (
    <QueryErrorBoundary>
      <Suspense fallback={<div>Loading...</div>}>
        <UserProfile userId="123" />
      </Suspense>
    </QueryErrorBoundary>
  )
}
```

## Query States

### Loading States

```typescript
const {
  data,
  isLoading,        // Initial load
  isFetching,       // Any fetch (including background)
  isRefetching,     // Refetching
  isPending,        // Alias for isLoading (v5)
} = getUser.use({ urlParams: { userId: '123' } })
```

### Error States

```typescript
const {
  error,
  isError,
  failureCount,
  failureReason,
} = getUser.use({ urlParams: { userId: '123' } })
```

### Success States

```typescript
const {
  data,
  isSuccess,
  dataUpdatedAt,
  status,
} = getUser.use({ urlParams: { userId: '123' } })
```

## Refetching

### Manual Refetch

```typescript
const { data, refetch } = getUser.use({
  urlParams: { userId: '123' },
})

// Refetch manually
<button onClick={() => refetch()}>Refresh</button>
```

### Refetch on Interval

```typescript
const { data } = getUser.use({
  urlParams: { userId: '123' },
  refetchInterval: 5000, // Refetch every 5 seconds
})
```

### Refetch on Window Focus

```typescript
const { data } = getUser.use({
  urlParams: { userId: '123' },
  refetchOnWindowFocus: true,
})
```

## Common Patterns

### Conditional Queries

```typescript
function UserProfile({ userId }: { userId?: string }) {
  const { data } = getUser.use({
    urlParams: { userId: userId! },
    enabled: !!userId, // Only fetch if userId exists
  })

  if (!userId) return <div>No user selected</div>
  return <div>{data.name}</div>
}
```

### Dependent Queries

```typescript
function UserPosts({ userId }: { userId: string }) {
  const { data: user } = getUser.use({ urlParams: { userId } })
  
  const { data: posts } = getPosts.use({
    urlParams: { userId },
    enabled: !!user, // Only fetch posts after user is loaded
  })

  return <div>{/* ... */}</div>
}
```

### Parallel Queries

```typescript
function Dashboard({ userId }: { userId: string }) {
  const { data: user } = getUser.use({ urlParams: { userId } })
  const { data: posts } = getPosts.use({ urlParams: { userId } })
  const { data: comments } = getComments.use({ urlParams: { userId } })

  // All queries run in parallel
  return <div>{/* ... */}</div>
}
```

## Next Steps

- [Infinite Queries](/docs/builder/react-query/guides/infinite-queries) - Paginated data
- [Mutations](/docs/builder/react-query/guides/mutations) - Data modifications
- [Query Keys](/docs/builder/react-query/guides/query-keys) - Query key management
- [Invalidation](/docs/builder/react-query/guides/invalidation) - Cache invalidation

