---
sidebar_position: 6
---

# Query Key Management

Query keys are used to identify and manage cached queries. Builder automatically generates hierarchical query keys based on your endpoint URLs and parameters.

## Key Structure

Query keys follow a hierarchical structure:

```
[...keyPrefix, ...urlParts, ...keySuffix, queryParams]
```

### Example

```typescript
const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  processResponse: (data) => data,
})

// URL: /users/123?include=posts
// keyPrefix: ['api']
// Key: ['api', 'users', '123', { include: 'posts' }]
```

## Key Methods

### dataTag

Get the full query key with all parameters:

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

// Full key with all parameters
const key = getUser.queryKey.dataTag({
  urlParams: { userId: '123' },
  params: { include: 'posts' },
})
// => ['users', '123', { include: 'posts' }]
```

### filterKey

Get a partial key for filtering (URL params only, ignores query params):

```typescript
// Partial key for filtering
const filterKey = getUser.queryKey.filterKey({
  urlParams: { userId: '123' },
})
// => ['users', '123']
```

### bindToUrl

Get the resolved URL string:

```typescript
const url = getUser.queryKey.bindToUrl({
  urlParams: { userId: '123' },
})
// => '/users/123'
```

## Using Query Keys

### Manual Cache Access

```typescript
import { useQueryClient } from '@tanstack/react-query'

function UserProfile({ userId }: { userId: string }) {
  const queryClient = useQueryClient()

  // Get cached data
  const cachedUser = queryClient.getQueryData(
    getUser.queryKey.dataTag({ urlParams: { userId } })
  )

  // Set cached data
  queryClient.setQueryData(
    getUser.queryKey.dataTag({ urlParams: { userId } }),
    { id: userId, name: 'John', email: 'john@example.com' }
  )

  return <div>{/* ... */}</div>
}
```

### Invalidation

```typescript
import { useQueryClient } from '@tanstack/react-query'

function UserProfile({ userId }: { userId: string }) {
  const queryClient = useQueryClient()

  const handleRefresh = () => {
    // Invalidate specific query
    queryClient.invalidateQueries({
      queryKey: getUser.queryKey.dataTag({ urlParams: { userId } }),
    })
  }

  return <button onClick={handleRefresh}>Refresh</button>
}
```

### Filtering Queries

```typescript
import { useQueryClient } from '@tanstack/react-query'

function UserList() {
  const queryClient = useQueryClient()

  const handleRefreshAll = () => {
    // Invalidate all user queries (ignores query params)
    queryClient.invalidateQueries({
      queryKey: getUser.queryKey.filterKey({ urlParams: { userId: 'any' } }),
    })
  }

  return <button onClick={handleRefreshAll}>Refresh All Users</button>
}
```

## Key Prefix and Suffix

Configure default key prefix/suffix when creating the client:

```typescript
const client = declareClient({
  api,
  defaults: {
    keyPrefix: ['api', 'v1'], // All keys will start with ['api', 'v1']
    keySuffix: ['cache'],     // All keys will end with ['cache']
  },
})

const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  processResponse: (data) => data,
})

// Key: ['api', 'v1', 'users', '123', 'cache']
const key = getUser.queryKey.dataTag({ urlParams: { userId: '123' } })
```

## Common Patterns

### Invalidate Related Queries

```typescript
function UserProfile({ userId }: { userId: string }) {
  const queryClient = useQueryClient()

  const handleUpdate = async () => {
    // After updating user, invalidate related queries
    await queryClient.invalidateQueries({
      queryKey: getUser.queryKey.filterKey({ urlParams: { userId } }),
    })
    await queryClient.invalidateQueries({
      queryKey: getUserPosts.queryKey.filterKey({ urlParams: { userId } }),
    })
  }

  return <button onClick={handleUpdate}>Update</button>
}
```

### Prefetch Data

```typescript
function UserList() {
  const queryClient = useQueryClient()

  const handlePrefetch = (userId: string) => {
    queryClient.prefetchQuery({
      queryKey: getUser.queryKey.dataTag({ urlParams: { userId } }),
      queryFn: () => getUser({ urlParams: { userId } }),
    })
  }

  return (
    <div>
      {users.map((user) => (
        <div
          key={user.id}
          onMouseEnter={() => handlePrefetch(user.id)}
        >
          {user.name}
        </div>
      ))}
    </div>
  )
}
```

### Manual Cache Updates

```typescript
function UserProfile({ userId }: { userId: string }) {
  const queryClient = useQueryClient()

  const handleOptimisticUpdate = (newName: string) => {
    // Update cache optimistically
    queryClient.setQueryData(
      getUser.queryKey.dataTag({ urlParams: { userId } }),
      (old: User | undefined) => {
        if (!old) return old
        return { ...old, name: newName }
      }
    )
  }

  return <div>{/* ... */}</div>
}
```

## Next Steps

- [Invalidation](/docs/builder/react-query/guides/invalidation) - Learn about cache invalidation
- [Optimistic Updates](/docs/builder/react-query/guides/optimistic-updates) - Update cache optimistically
- [Mutations](/docs/builder/react-query/guides/mutations) - Use keys in mutations

