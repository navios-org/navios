---
sidebar_position: 7
---

# Invalidation

Invalidation is the process of marking cached queries as stale, causing them to refetch. Builder provides convenient methods for invalidating queries based on your endpoint definitions.

## Invalidate Specific Query

Invalidate a query with exact parameters:

```typescript
const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  querySchema: z.object({
    include: z.string().optional(),
  }),
  responseSchema: userSchema,
  processResponse: (data) => data,
})

// Invalidate specific query
await getUser.invalidate(queryClient, {
  urlParams: { userId: '123' },
  params: { include: 'posts' },
})
```

## Invalidate All Matching Queries

Invalidate all queries for an endpoint (ignores query params):

```typescript
// Invalidate all queries for this user (ignores query params)
await getUser.invalidateAll(queryClient, {
  urlParams: { userId: '123' },
})
```

## Using in Components

### After Mutation

```typescript
const updateUser = client.mutation({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: userUpdateSchema,
  responseSchema: userSchema,
  processResponse: (data) => data,
  useContext: () => ({ queryClient: useQueryClient() }),
  onSuccess: (data, variables, context) => {
    // Invalidate user query after update
    getUser.invalidate(context.queryClient, {
      urlParams: { userId: variables.urlParams.userId },
    })
  },
})
```

### Manual Invalidation

```typescript
function UserProfile({ userId }: { userId: string }) {
  const queryClient = useQueryClient()

  const handleRefresh = async () => {
    await getUser.invalidate(queryClient, {
      urlParams: { userId },
    })
  }

  return <button onClick={handleRefresh}>Refresh</button>
}
```

## Invalidation Patterns

### After Create

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: userCreateSchema,
  responseSchema: userSchema,
  processResponse: (data) => data,
  useContext: () => ({ queryClient: useQueryClient() }),
  onSuccess: (data, variables, context) => {
    // Invalidate users list
    getUsers.invalidateAll(context.queryClient, {})
  },
})
```

### After Update

```typescript
const updateUser = client.mutation({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: userUpdateSchema,
  responseSchema: userSchema,
  processResponse: (data) => data,
  useContext: () => ({ queryClient: useQueryClient() }),
  onSuccess: (data, variables, context) => {
    // Invalidate specific user
    getUser.invalidate(context.queryClient, {
      urlParams: { userId: data.id },
    })
    // Invalidate users list
    getUsers.invalidateAll(context.queryClient, {})
  },
})
```

### After Delete

```typescript
const deleteUser = client.mutation({
  method: 'DELETE',
  url: '/users/$userId',
  responseSchema: z.object({ success: z.boolean() }),
  processResponse: (data) => data,
  useContext: () => ({ queryClient: useQueryClient() }),
  onSuccess: (data, variables, context) => {
    // Remove from cache
    context.queryClient.removeQueries({
      queryKey: getUser.queryKey.filterKey({
        urlParams: { userId: variables.urlParams.userId },
      }),
    })
    // Invalidate users list
    getUsers.invalidateAll(context.queryClient, {})
  },
})
```

## Manual Invalidation

### Using Query Keys

```typescript
import { useQueryClient } from '@tanstack/react-query'

function UserProfile({ userId }: { userId: string }) {
  const queryClient = useQueryClient()

  const handleInvalidate = () => {
    // Manual invalidation with filter key
    queryClient.invalidateQueries({
      queryKey: getUser.queryKey.filterKey({ urlParams: { userId } }),
    })
  }

  return <button onClick={handleInvalidate}>Invalidate</button>
}
```

### Invalidate Multiple Endpoints

```typescript
function UserProfile({ userId }: { userId: string }) {
  const queryClient = useQueryClient()

  const handleRefreshAll = async () => {
    // Invalidate all user-related queries
    await Promise.all([
      getUser.invalidateAll(queryClient, { urlParams: { userId } }),
      getUserPosts.invalidateAll(queryClient, { urlParams: { userId } }),
      getUserSettings.invalidateAll(queryClient, { urlParams: { userId } }),
    ])
  }

  return <button onClick={handleRefreshAll}>Refresh All</button>
}
```

## Common Patterns

### Invalidate on Window Focus

```typescript
function UserProfile({ userId }: { userId: string }) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const handleFocus = () => {
      getUser.invalidate(queryClient, {
        urlParams: { userId },
      })
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [userId, queryClient])

  return <div>{/* ... */}</div>
}
```

### Invalidate on Interval

```typescript
function UserProfile({ userId }: { userId: string }) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const interval = setInterval(() => {
      getUser.invalidate(queryClient, {
        urlParams: { userId },
      })
    }, 30000) // Every 30 seconds

    return () => clearInterval(interval)
  }, [userId, queryClient])

  return <div>{/* ... */}</div>
}
```

### Invalidate After Timeout

```typescript
const updateUser = client.mutation({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: userUpdateSchema,
  responseSchema: userSchema,
  processResponse: (data) => data,
  useContext: () => ({ queryClient: useQueryClient() }),
  onSuccess: (data, variables, context) => {
    // Invalidate after a delay
    setTimeout(() => {
      getUser.invalidate(context.queryClient, {
        urlParams: { userId: data.id },
      })
    }, 1000)
  },
})
```

## Best Practices

### Invalidate Related Queries

```typescript
// ✅ Good - invalidate related queries
const updateUser = client.mutation({
  // ...
  onSuccess: (data, variables, context) => {
    getUser.invalidate(context.queryClient, {
      urlParams: { userId: data.id },
    })
    getUsers.invalidateAll(context.queryClient, {})
  },
})
```

### Use invalidateAll for Lists

```typescript
// ✅ Good - invalidate all list queries
const createUser = client.mutation({
  // ...
  onSuccess: (data, variables, context) => {
    getUsers.invalidateAll(context.queryClient, {})
  },
})
```

### Remove Queries on Delete

```typescript
// ✅ Good - remove deleted items from cache
const deleteUser = client.mutation({
  // ...
  onSuccess: (data, variables, context) => {
    context.queryClient.removeQueries({
      queryKey: getUser.queryKey.filterKey({
        urlParams: { userId: variables.urlParams.userId },
      }),
    })
  },
})
```

## Next Steps

- [Query Keys](/docs/builder/react-query/guides/query-keys) - Understand query key structure
- [Mutations](/docs/builder/react-query/guides/mutations) - Invalidate after mutations
- [Optimistic Updates](/docs/builder/react-query/guides/optimistic-updates) - Update cache optimistically

