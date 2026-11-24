# SSR & Prefetching

Prefetching fills the cache before a component needs the data: on the server, so the first render already has it, or on the client, ahead of a navigation. Every query and infinite query has helpers for it.

## Helpers

All of them take the `QueryClient` first and the query's arguments second:

| Helper                        | Resolves with | On failure | Uses the cache                                    |
| ----------------------------- | ------------- | ---------- | ------------------------------------------------- |
| `query.prefetch(qc, args)`    | nothing       | resolves   | Skips the request when fresh data is cached       |
| `query.fetch(qc, args)`       | the data      | rejects    | Skips the request when fresh data is cached       |
| `query.ensure(qc, args)`      | the data      | rejects    | Returns cached data however stale; fetches if empty |

```typescript
await getUser.prefetch(queryClient, { urlParams: { userId } })

const user = await getUser.fetch(queryClient, { urlParams: { userId } })

const cachedOrFetched = await getUser.ensure(queryClient, { urlParams: { userId } })
```

:::info
The helpers are built on TanStack's `queryClient.query()` (and `queryClient.infiniteQuery()` for infinite queries), because `fetchQuery`, `prefetchQuery` and `ensureQueryData` are deprecated upstream. `@navios/react-query` requires `@tanstack/react-query ^5.102.0`.
:::

To pass TanStack options such as `staleTime`, call the query for its options and hand them to the `QueryClient`:

```typescript
await queryClient.query(getUser({ urlParams: { userId } }, { staleTime: 60_000 }))
```

## Server Rendering

The pattern is the standard TanStack one: create a `QueryClient` per request, prefetch, `dehydrate`, and wrap the client components in a `HydrationBoundary`.

### Next.js App Router

```typescript
// app/users/[userId]/page.tsx
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'

import { getUser, getUserPosts } from '@/api/users'

import { UserProfile } from './user-profile'

export default async function UserPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const queryClient = new QueryClient()

  await Promise.all([
    getUser.prefetch(queryClient, { urlParams: { userId } }),
    getUserPosts.prefetch(queryClient, { urlParams: { userId } }),
  ])

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <UserProfile userId={userId} />
    </HydrationBoundary>
  )
}
```

```typescript
// app/users/[userId]/user-profile.tsx
'use client'

import { getUser } from '@/api/users'

export function UserProfile({ userId }: { userId: string }) {
  // Served from the hydrated cache, no loading state on first render
  const { data } = getUser.useSuspense({ urlParams: { userId } })

  return <h1>{data.name}</h1>
}
```

### Next.js Pages Router

```typescript
// pages/users/[userId].tsx
import { dehydrate, QueryClient } from '@tanstack/react-query'

import type { GetServerSideProps } from 'next'

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const userId = String(params?.userId)
  const queryClient = new QueryClient()

  await getUser.prefetch(queryClient, { urlParams: { userId } })

  return {
    props: {
      userId,
      dehydratedState: dehydrate(queryClient),
    },
  }
}
```

### Arguments Must Match

The server and the client must use the same arguments, because the arguments are the cache key. URL param values are stringified in the key, so a number on one side and a string on the other is fine; different query params are different entries.

```typescript
// Server
await listUsers.prefetch(queryClient, { params: { page: 1, limit: 20 } })

// Client: same params, so the hydrated entry is used
listUsers.use({ params: { page: 1, limit: 20 } })
```

## Per-Request HTTP Client

On a server, requests made for one user must carry that user's cookies or token. `setHttpClient` binds an HTTP client to a `QueryClient`: every query, infinite query and mutation that runs through that `QueryClient` uses the bound client instead of the builder's shared one.

```typescript
import { create } from '@navios/http'
import { getHttpClient, setHttpClient } from '@navios/react-query'
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { cookies } from 'next/headers'

export default async function UserPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const queryClient = new QueryClient()

  // One HTTP client for this request, bound to this request's QueryClient
  setHttpClient(
    queryClient,
    create({
      baseURL: process.env.API_URL,
      headers: { cookie: (await cookies()).toString() },
    }),
  )

  await getUser.prefetch(queryClient, { urlParams: { userId } })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <UserProfile userId={userId} />
    </HydrationBoundary>
  )
}
```

Since a server creates one `QueryClient` per request, the binding isolates requests without touching global state. The same query objects are used on the server and in the browser; only the `QueryClient` differs.

- `setHttpClient(queryClient, client)` binds a client; `setHttpClient(queryClient, null)` removes the binding.
- `getHttpClient(queryClient)` returns the bound client, or `undefined`.
- A `QueryClient` without a binding uses the builder's client.

## Handling Prefetch Failures

`prefetch` never rejects. A failed prefetch leaves the entry in the error state; the component then fetches on the client and reports the error through its hook or error boundary.

Use `fetch` or `ensure` when the server must react to the failure:

```typescript
import { isHttpError } from '@navios/builder'
import { notFound } from 'next/navigation'

export default async function UserPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const queryClient = new QueryClient()

  try {
    await getUser.fetch(queryClient, { urlParams: { userId } })
  } catch (error) {
    if (isHttpError(error, 404)) notFound()
    throw error
  }

  // ...
}
```

## Infinite Queries

`prefetch` on an infinite query loads the first page:

```typescript
await listPosts.prefetch(queryClient, { params: { limit: 20 } })

// Client
const { data, fetchNextPage } = listPosts.use({ params: { limit: 20 } })
```

## Client-Side Prefetching

### On Hover

```typescript
function UserLink({ userId, children }: { userId: string; children: React.ReactNode }) {
  const queryClient = useQueryClient()

  return (
    <Link
      to={`/users/${userId}`}
      onMouseEnter={() => void getUser.prefetch(queryClient, { urlParams: { userId } })}
    >
      {children}
    </Link>
  )
}
```

### In Route Loaders

`ensure` suits loaders: it returns cached data immediately and fetches only when nothing is cached.

```typescript
// React Router
export const loader =
  (queryClient: QueryClient) =>
  async ({ params }: LoaderFunctionArgs) =>
    getUser.ensure(queryClient, { urlParams: { userId: params.userId! } })
```

## Persisted Caches

:::warning
Cache keys have the shape `[...keyPrefix, method, urlTemplate, ...keySuffix, 'with-response'?, 'infinite'?, inputs?]`. A cache persisted by `@navios/react-query` 1.x uses a different shape and matches nothing: discard it when upgrading, for example by changing the persister's `buster`.
:::

## Best Practices

- **Create a `QueryClient` per request** on the server, never a module-level one.
- **Prefetch in parallel** with `Promise.all`.
- **Bind a per-request HTTP client** with `setHttpClient` whenever requests depend on the user.
- **Set a `staleTime`** on the client's `QueryClient` so hydrated data is not refetched immediately.

## Next Steps

- [Suspense](/docs/builder/react-query/guides/suspense) - Use Suspense with prefetched data
- [Query Keys](/docs/builder/react-query/guides/query-keys) - How arguments become keys
- [Queries](/docs/builder/react-query/guides/queries) - Cache helpers on a query
