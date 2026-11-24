---
sidebar_position: 2
---

# Infinite Queries

Infinite queries load paginated data page by page. `client.infiniteQuery` returns an infinite query object with the same hooks and helpers as a [query](/docs/builder/react-query/guides/queries); the cached value is TanStack's `InfiniteData<Page, PageParam>`.

## Basic Infinite Query

The endpoint must have a `querySchema`: the page param is a set of query params.

```typescript
const listUsers = client.infiniteQuery({
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
  getNextPageParam: (lastPage) =>
    lastPage.nextCursor ? { cursor: lastPage.nextCursor } : undefined,
})
```

## Usage

```typescript
function UserList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } =
    listUsers.use({ params: { limit: 20 } })

  if (isPending) return <div>Loading...</div>

  return (
    <div>
      {data?.pages.flatMap((page) =>
        page.users.map((user) => <div key={user.id}>{user.name}</div>),
      )}
      {hasNextPage && (
        <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  )
}
```

## Infinite Query from an Existing Endpoint

Pass the handler first and the pagination settings second:

```typescript
// shared/endpoints/users.ts
export const listUsersEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({ page: z.number(), pageSize: z.number().optional() }),
  responseSchema: z.object({ users: z.array(userSchema), hasMore: z.boolean() }),
})

// client/queries/users.ts
const listUsers = client.infiniteQuery(listUsersEndpoint, {
  getNextPageParam: (lastPage, _allPages, lastPageParam) =>
    lastPage.hasMore ? { ...lastPageParam, page: lastPageParam.page + 1 } : undefined,
})
```

## How Page Params Work

- **The page param is a set of query params.** For each page the endpoint is called with the page param merged over the call's `params`: `{ ...args.params, ...pageParam }`.
- **The first page param defaults to the call's `params`.** `listUsers.use({ params: { page: 1, pageSize: 20 } })` requests the first page with exactly those params. The page param is the object as you passed it — it is not run through `querySchema`, so a default or transform declared in the schema does not show up in `lastPageParam` or in `data.pageParams`. (Each request is still validated with `querySchema` when it is sent.) Pass every param that `getNextPageParam` reads.
- **`getNextPageParam` returns the query params to change**, or `undefined` / `null` when there are no more pages. Because of the merge, returning only `{ cursor }` or `{ page }` is enough; the rest of the call's `params` is kept.

```typescript
const { data } = listUsers.use({ params: { page: 1, pageSize: 20 } })
// page 1: GET /users?page=1&pageSize=20
// page 2: GET /users?page=2&pageSize=20
```

## Settings

### getNextPageParam

Required. Receives the last page, all pages, the last page param and all page params:

```typescript
getNextPageParam: (lastPage, allPages, lastPageParam, allPageParams) =>
  lastPage.hasMore ? { ...lastPageParam, page: lastPageParam.page + 1 } : undefined,
```

### getPreviousPageParam

Optional, for bidirectional pagination:

```typescript
getPreviousPageParam: (firstPage, allPages, firstPageParam) =>
  firstPageParam.page > 1 ? { ...firstPageParam, page: firstPageParam.page - 1 } : undefined,
```

### initialPageParam

Optional. Overrides the first page param, which otherwise is the call's `params`:

```typescript
const listUsers = client.infiniteQuery(listUsersEndpoint, {
  getNextPageParam: (lastPage, _allPages, lastPageParam) =>
    lastPage.hasMore ? { page: lastPageParam.page + 1 } : undefined,
  initialPageParam: { page: 1 },
})
```

`keyPrefix` and `keySuffix` are accepted here too, see [Query Keys](/docs/builder/react-query/guides/query-keys).

### withResponse

Optional. With `withResponse: true` every page is `{ data, response }`, where `response` is `{ status, statusText, headers }` with headers as a plain lower-cased record. Use it when pagination is driven by a header:

```typescript
const listUsers = client.infiniteQuery({
  method: 'GET',
  url: '/users',
  querySchema: z.object({ page: z.number() }),
  responseSchema: z.array(userSchema),
  withResponse: true,
  getNextPageParam: (lastPage, _allPages, lastPageParam) =>
    lastPage.response.headers['x-has-more'] === 'true'
      ? { page: lastPageParam.page + 1 }
      : undefined,
})

const { data } = listUsers.use({ params: { page: 1 } })
const users = data?.pages.flatMap((page) => page.data)
```

The key of such a query carries both markers: `['GET', '/users', 'with-response', 'infinite', { params: { page: 1 } }]`. See [Response Metadata](/docs/builder/react-query/guides/queries#response-metadata).

## Pagination Patterns

### Cursor-Based

```typescript
const listPosts = client.infiniteQuery({
  method: 'GET',
  url: '/posts',
  querySchema: z.object({
    cursor: z.string().optional(),
    limit: z.number().optional(),
  }),
  responseSchema: z.object({
    posts: z.array(postSchema),
    nextCursor: z.string().nullable(),
  }),
  getNextPageParam: (lastPage) =>
    lastPage.nextCursor ? { cursor: lastPage.nextCursor } : undefined,
})

listPosts.use({ params: { limit: 20 } })
```

### Offset-Based

```typescript
const listPosts = client.infiniteQuery({
  method: 'GET',
  url: '/posts',
  querySchema: z.object({ offset: z.number(), limit: z.number() }),
  responseSchema: z.object({
    posts: z.array(postSchema),
    total: z.number(),
  }),
  getNextPageParam: (lastPage, _allPages, lastPageParam) => {
    const nextOffset = lastPageParam.offset + lastPageParam.limit
    return nextOffset < lastPage.total ? { ...lastPageParam, offset: nextOffset } : undefined
  },
})

listPosts.use({ params: { offset: 0, limit: 20 } })
```

### Page Number

```typescript
const listPosts = client.infiniteQuery({
  method: 'GET',
  url: '/posts',
  querySchema: z.object({ page: z.number(), pageSize: z.number() }),
  responseSchema: z.object({
    posts: z.array(postSchema),
    totalPages: z.number(),
  }),
  getNextPageParam: (lastPage, _allPages, lastPageParam) =>
    lastPageParam.page < lastPage.totalPages
      ? { ...lastPageParam, page: lastPageParam.page + 1 }
      : undefined,
})

listPosts.use({ params: { page: 1, pageSize: 20 } })
```

## Accessing Data

```typescript
const { data } = listUsers.use({ params: { limit: 20 } })

data?.pages // every loaded page
data?.pageParams // the page param of every loaded page
const users = data?.pages.flatMap((page) => page.users) ?? []
```

Use `select` to flatten once for a call site:

```typescript
const { data: users } = listUsers.use(
  { params: { limit: 20 } },
  { select: (data) => data.pages.flatMap((page) => page.users) },
)
```

## Hook Options

`use(args, options?)` and `useSuspense(args, options?)` accept every TanStack infinite query option except `queryKey`, `queryFn` and the pagination settings, which are fixed by the declaration:

```typescript
listUsers.use({ params: { limit: 20 } }, { staleTime: 60_000, refetchOnWindowFocus: false })
```

`use()` also accepts `skipToken` in place of the arguments.

## Common Patterns

### Infinite Scroll

```typescript
import { useEffect, useRef } from 'react'

function InfiniteUserList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = listUsers.use({
    params: { limit: 20 },
  })
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = sentinel.current
    if (!element) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage()
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <div>
      {data?.pages.flatMap((page) =>
        page.users.map((user) => <div key={user.id}>{user.name}</div>),
      )}
      <div ref={sentinel} />
      {isFetchingNextPage && <div>Loading more...</div>}
    </div>
  )
}
```

### With Suspense

```typescript
function UserList() {
  const { data, fetchNextPage, hasNextPage } = listUsers.useSuspense({
    params: { limit: 20 },
  })

  return (
    <div>
      {data.pages.flatMap((page) =>
        page.users.map((user) => <div key={user.id}>{user.name}</div>),
      )}
      {hasNextPage && <button onClick={() => fetchNextPage()}>Load More</button>}
    </div>
  )
}
```

## Cache

Infinite queries have their own cache entries: the key carries an `'infinite'` marker, so the same endpoint can also be used with `client.query` without the two overwriting each other.

```typescript
listUsers.key({ params: { limit: 20 } })
// ['GET', '/users', 'infinite', { params: { limit: 20 } }]

await listUsers.prefetch(queryClient, { params: { limit: 20 } }) // first page
await listUsers.invalidate(queryClient) // every infinite entry of this endpoint
```

`fetch`, `prefetch` and `ensure` are built on TanStack's `queryClient.infiniteQuery()`.

## Next Steps

- [Queries](/docs/builder/react-query/guides/queries) - Basic queries
- [Suspense](/docs/builder/react-query/guides/suspense) - Use Suspense with infinite queries
- [Invalidation](/docs/builder/react-query/guides/invalidation) - Refresh cached data
