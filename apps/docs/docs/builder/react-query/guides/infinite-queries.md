---
sidebar_position: 2
---

# Infinite Queries

Infinite queries are perfect for paginated data, infinite scroll, and "load more" patterns. They automatically manage page state and provide easy access to all loaded pages.

## Basic Infinite Query

```typescript
const getUsers = client.infiniteQuery({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    cursor: z.string().optional(),
    limit: z.number().optional(),
  }),
  responseSchema: z.object({
    users: z.array(userSchema),
    nextCursor: z.string().nullable(),
  }),
  processResponse: (data) => data,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  initialPageParam: undefined,
})
```

## Usage

```typescript
function UserList() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = getUsers.use({
    params: { limit: 20 },
  })

  return (
    <div>
      {data?.pages.flatMap((page) =>
        page.users.map((user) => (
          <UserCard key={user.id} user={user} />
        ))
      )}
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  )
}
```

## Infinite Query from Endpoint

```typescript
// shared/endpoints/users.ts
export const getUsersEndpoint = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    cursor: z.string().optional(),
    limit: z.number().optional(),
  }),
  responseSchema: z.object({
    users: z.array(userSchema),
    nextCursor: z.string().nullable(),
  }),
})
```

```typescript
// client/queries/users.ts
const getUsers = client.infiniteQueryFromEndpoint(getUsersEndpoint, {
  processResponse: (data) => data,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  initialPageParam: undefined,
})
```

## Configuration Options

### getNextPageParam

Extract the next page parameter from the last page:

```typescript
const getUsers = client.infiniteQuery({
  // ...
  getNextPageParam: (lastPage, allPages) => {
    // Return undefined to stop fetching
    return lastPage.nextCursor ?? undefined
  },
})
```

### getPreviousPageParam

For bidirectional pagination:

```typescript
const getUsers = client.infiniteQuery({
  // ...
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  getPreviousPageParam: (firstPage) => firstPage.prevCursor ?? undefined,
  initialPageParam: undefined,
})
```

### initialPageParam

Set the initial page parameter:

```typescript
const getUsers = client.infiniteQuery({
  // ...
  initialPageParam: undefined, // or null, or a starting value
})
```

## Pagination Patterns

### Cursor-Based

```typescript
const getUsers = client.infiniteQuery({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    cursor: z.string().optional(),
  }),
  responseSchema: z.object({
    users: z.array(userSchema),
    nextCursor: z.string().nullable(),
  }),
  processResponse: (data) => data,
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  initialPageParam: undefined,
})
```

### Offset-Based

```typescript
const getUsers = client.infiniteQuery({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    offset: z.number().optional(),
    limit: z.number().optional(),
  }),
  responseSchema: z.object({
    users: z.array(userSchema),
    hasMore: z.boolean(),
  }),
  processResponse: (data) => data,
  getNextPageParam: (lastPage, allPages) => {
    if (!lastPage.hasMore) return undefined
    const currentOffset = allPages.length * 20
    return currentOffset
  },
  initialPageParam: 0,
})
```

### Page Number

```typescript
const getUsers = client.infiniteQuery({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().optional(),
  }),
  responseSchema: z.object({
    users: z.array(userSchema),
    totalPages: z.number(),
  }),
  processResponse: (data) => data,
  getNextPageParam: (lastPage, allPages) => {
    const nextPage = allPages.length + 1
    return nextPage <= lastPage.totalPages ? nextPage : undefined
  },
  initialPageParam: 1,
})
```

## Accessing Data

### All Pages

```typescript
const { data } = getUsers.use({ params: { limit: 20 } })

// data.pages is an array of all loaded pages
data?.pages.forEach((page, index) => {
  console.log(`Page ${index + 1}:`, page.users)
})
```

### Flattened Data

```typescript
const { data } = getUsers.use({ params: { limit: 20 } })

// Flatten all pages into a single array
const allUsers = data?.pages.flatMap((page) => page.users) ?? []
```

### Current Page

```typescript
const { data } = getUsers.use({ params: { limit: 20 } })

// Get the last page
const lastPage = data?.pages[data.pages.length - 1]
```

## Loading States

```typescript
const {
  data,
  isLoading,          // Initial load
  isFetching,        // Any fetch
  isFetchingNextPage, // Fetching next page
  isRefetching,      // Refetching all pages
} = getUsers.use({ params: { limit: 20 } })
```

## Common Patterns

### Infinite Scroll

```typescript
function InfiniteUserList() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = getUsers.use({ params: { limit: 20 } })

  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY >=
        document.documentElement.offsetHeight - 100
      ) {
        if (hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <div>
      {data?.pages.flatMap((page) =>
        page.users.map((user) => (
          <UserCard key={user.id} user={user} />
        ))
      )}
      {isFetchingNextPage && <div>Loading more...</div>}
    </div>
  )
}
```

### Load More Button

```typescript
function UserList() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = getUsers.use({ params: { limit: 20 } })

  return (
    <div>
      {data?.pages.flatMap((page) =>
        page.users.map((user) => (
          <UserCard key={user.id} user={user} />
        ))
      )}
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  )
}
```

### With Suspense

```typescript
function InfiniteUserList() {
  const data = getUsers.useSuspense({ params: { limit: 20 } })

  return (
    <div>
      {data.pages.flatMap((page) =>
        page.users.map((user) => (
          <UserCard key={user.id} user={user} />
        ))
      )}
    </div>
  )
}
```

## Refetching

### Refetch All Pages

```typescript
const { refetch } = getUsers.use({ params: { limit: 20 } })

// Refetches all pages
<button onClick={() => refetch()}>Refresh All</button>
```

### Refetch from Specific Page

```typescript
const { refetch } = getUsers.use({ params: { limit: 20 } })

// Refetch from page 2 onwards
refetch({ refetchPage: (page, index) => index >= 1 })
```

## Next Steps

- [Mutations](/docs/builder/react-query/guides/mutations) - Data modifications
- [Query Keys](/docs/builder/react-query/guides/query-keys) - Query key management
- [Invalidation](/docs/builder/react-query/guides/invalidation) - Cache invalidation

