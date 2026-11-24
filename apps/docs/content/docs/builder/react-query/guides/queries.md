# Queries

Queries fetch data from your API and cache it. `client.query` returns a query object: call it to get TanStack query options, or use the hooks and cache helpers attached to it.

## Basic Query

```typescript
import { z } from 'zod'

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

function UserProfile({ userId }: { userId: string }) {
  const { data, isPending, error } = getUser.use({ urlParams: { userId } })

  if (isPending) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return <div>{data.name}</div>
}
```

## Query from an Existing Endpoint

When an endpoint is already declared with the builder (for example in a package shared with the server), pass the handler instead of an inline config:

```typescript
// shared/endpoints/users.ts
export const getUserEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// client/queries/users.ts
const getUser = client.query(getUserEndpoint)

getUser.endpoint // the same handler, for direct calls outside React
```

Both forms produce the same query object.

## Arguments

The arguments are the endpoint's call arguments. The object is optional when the endpoint requires nothing.

```typescript
const listUsers = client.query({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().optional(),
    search: z.string().optional(),
  }),
  responseSchema: z.array(userSchema),
})

listUsers.use() // nothing is required
listUsers.use({ params: { page: 2, search: 'ada' } })

getUser.use({ urlParams: { userId: '123' } }) // urlParams is required
```

| Key         | Source                         |
| ----------- | ------------------------------ |
| `urlParams` | `$name` segments of the URL    |
| `params`    | `querySchema`                  |
| `data`      | `requestSchema` (POST queries) |
| `headers`   | Per-call headers               |
| `timeout`   | Per-call timeout               |

`urlParams`, `params` and `data` identify the request and are part of the cache key. `headers` and `timeout` are not.

### POST Queries

Some APIs use POST for reads (search, reports). The request body is part of the cache key, so different bodies are different cache entries:

```typescript
const searchUsers = client.query({
  method: 'POST',
  url: '/users/search',
  requestSchema: z.object({ query: z.string() }),
  responseSchema: z.array(userSchema),
})

const { data } = searchUsers.use({ data: { query: 'ada' } })
```

## Hooks

### use()

`use(args, options?)` is `useQuery`. The second argument accepts every TanStack Query option except `queryKey` and `queryFn`:

```typescript
const { data } = getUser.use(
  { urlParams: { userId } },
  {
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 30_000,
    enabled: isVisible,
  },
)
```

### useSuspense()

`useSuspense(args, options?)` is `useSuspenseQuery`: it suspends while loading and throws to the nearest error boundary on failure, so `data` is always defined.

```typescript
function UserProfile({ userId }: { userId: string }) {
  const { data } = getUser.useSuspense({ urlParams: { userId } })
  return <div>{data.name}</div>
}
```

See [Suspense](/docs/builder/react-query/guides/suspense).

### Query Options

Calling the query object returns TanStack query options. Use them with `useQuery`, `useSuspenseQuery`, `useQueries` or `queryClient.query`:

```typescript
import { useQueries, useQuery } from '@tanstack/react-query'

const user = useQuery(getUser({ urlParams: { userId } }))

const users = useQueries({
  queries: userIds.map((userId) => getUser({ urlParams: { userId } })),
})
```

## Projecting with `select`

`select` transforms the cached data for one call site; the hook's `data` takes the selected type:

```typescript
const { data: name } = getUser.use(
  { urlParams: { userId } },
  { select: (user) => user.name },
)
// name: string | undefined
```

## Conditional and Dependent Queries

Pass `skipToken` instead of the arguments while an input is not known yet. The query stays disabled and nothing is fetched:

```typescript
import { skipToken } from '@tanstack/react-query'

function UserProfile({ userId }: { userId: string | null }) {
  const { data } = getUser.use(userId ? { urlParams: { userId } } : skipToken)
  // ...
}
```

A query that depends on another query's result works the same way:

```typescript
function UserTeam({ userId }: { userId: string }) {
  const { data: user } = getUser.use({ urlParams: { userId } })
  const { data: team } = getTeam.use(
    user ? { urlParams: { teamId: user.teamId } } : skipToken,
  )
  // ...
}
```

When the arguments are known and you only want to pause fetching, use `enabled`:

```typescript
const { data } = getUser.use({ urlParams: { userId } }, { enabled: isOpen })
```

:::note
`skipToken` is not accepted by `useSuspense()` — a suspense query always fetches.
:::

## Error Handling

A failed query rejects with the endpoint's `EndpointError`. With `use()` it is the hook's `error`; with `useSuspense()` it is thrown to the error boundary.

```typescript
const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  errorSchema: {
    404: z.object({ message: z.string() }),
  },
})

function UserProfile({ userId }: { userId: string }) {
  const { data, isPending, error } = getUser.use({ urlParams: { userId } })

  if (isPending) return <div>Loading...</div>
  if (error) {
    if (error.kind === 'http' && error.status === 404) {
      return <div>{error.body.message}</div>
    }
    if (error.kind === 'network') return <div>You appear to be offline</div>
    return <div>Something went wrong</div>
  }

  return <div>{data.name}</div>
}
```

Invalid arguments are reported the same way: the request is not sent and the query fails with `error.kind === 'request-validation'` instead of throwing while rendering.

See [Typed Errors](/docs/builder/react-query/advanced/error-schemas) for all error kinds.

## Response Metadata

Sometimes a header matters to the UI: an `ETag`, a pagination total, a rate limit. Declare the query with `withResponse: true` and its data becomes `{ data, response }`:

```typescript
const listUsers = client.query({
  method: 'GET',
  url: '/users',
  querySchema: z.object({ page: z.number() }),
  responseSchema: z.array(userSchema),
  withResponse: true,
})

function UserList({ page }: { page: number }) {
  const { data } = listUsers.use({ params: { page } })

  if (!data) return <div>Loading...</div>

  const total = Number(data.response.headers['x-total-count'] ?? 0)

  return (
    <div>
      <p>{total} users</p>
      {data.data.map((user) => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  )
}
```

With an existing endpoint it goes in the second argument:

```typescript
const getUser = client.query(getUserEndpoint, { withResponse: true })
```

- **`data`** is what the query would deliver without the option.
- **`response`** is `{ status, statusText, headers }`. `headers` is a plain record with lower-cased names (`headers.etag`, `headers['x-total-count']`), not a `Headers` instance, so the cached value is serializable and safe for SSR dehydration and cache persistence.
- **Every surface of the query uses the wrapped shape**: `use`, `useSuspense`, `select`, `fetch`, `ensure`, `getData` and `setData`.
- **Failures are unchanged.** A failed request still lands in `error` as the endpoint's `EndpointError`; `error.response` has the metadata of a failed response.
- **The entries have their own cache key.** The key carries a `'with-response'` marker, so the same endpoint declared with and without the option never share an entry. See [Query Keys](/docs/builder/react-query/guides/query-keys#key-structure).

The option is also available on [infinite queries](/docs/builder/react-query/guides/infinite-queries#withresponse) and [mutations](/docs/builder/react-query/guides/mutations#withresponse).

## Cache Helpers

Every helper takes the `QueryClient` first, then the same arguments as the hook.

```typescript
const queryClient = useQueryClient()
const args = { urlParams: { userId } }

// Fetch through the cache: resolves with data, rejects with the EndpointError
const user = await getUser.fetch(queryClient, args)

// Warm the cache: resolves with nothing and never rejects
await getUser.prefetch(queryClient, args)

// Cached data if there is any, however stale; otherwise fetch
const cached = await getUser.ensure(queryClient, args)

// Read and write the cache entry
getUser.getData(queryClient, args) // User | undefined
getUser.setData(queryClient, args, (old) => old && { ...old, name: 'Ada' })

// Invalidate
await getUser.invalidate(queryClient, args)
```

:::info
`fetch`, `prefetch` and `ensure` are built on TanStack's `queryClient.query()`, because `fetchQuery`, `prefetchQuery` and `ensureQueryData` are deprecated upstream. This is why the peer dependency is `@tanstack/react-query ^5.102.0`.
:::

## Refetching

The hook result is TanStack's, so `refetch` and the refetch options work as usual:

```typescript
const { data, refetch, isFetching } = getUser.use(
  { urlParams: { userId } },
  { refetchInterval: 5000 },
)

<button onClick={() => refetch()} disabled={isFetching}>Refresh</button>
```

## Next Steps

- [Infinite Queries](/docs/builder/react-query/guides/infinite-queries) - Paginated data
- [Query Keys](/docs/builder/react-query/guides/query-keys) - How keys are built
- [Invalidation](/docs/builder/react-query/guides/invalidation) - Refresh cached data
- [Suspense](/docs/builder/react-query/guides/suspense) - Use Suspense for cleaner code
