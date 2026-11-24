---
title: SSR and prefetching
---

# SSR and prefetching

Prefetching fills the cache before a component asks for the data, so the first render already has it. This page covers doing that on a server: which helper to call, how the data reaches the browser, and how to make server-side requests carry the current user's credentials.

The hydration mechanics are TanStack's and are not repeated here; see its [SSR guide](https://tanstack.com/query/latest/docs/framework/react/guides/ssr) for the framework setup.

## Prefetch, dehydrate, hydrate

Create a `QueryClient` for the request, fill it with the query's own helpers, and hand the dehydrated state to the client. The example is a Next.js server component; the three steps are the same in any framework.

```tsx title="app/users/[userId]/page.tsx"
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'

import { userQuery, usersQuery } from '@/queries'

import { UserProfile } from './user-profile'

export default async function UserPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const queryClient = new QueryClient()

  await Promise.all([
    userQuery.prefetch(queryClient, { urlParams: { userId } }),
    usersQuery.prefetch(queryClient),
  ])

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <UserProfile userId={userId} />
    </HydrationBoundary>
  )
}
```

```tsx title="app/users/[userId]/user-profile.tsx"
'use client'

import { userQuery } from '@/queries'

export function UserProfile({ userId }: { userId: string }) {
  // Served from the hydrated cache: no request and no loading state on first render
  const { data: user } = userQuery.useSuspense({ urlParams: { userId } })

  return <h1>{user.name}</h1>
}
```

The same query objects run on both sides. Only the `QueryClient` differs.

:::warning
The server and the client must pass the same arguments, because the arguments are the cache key. `prefetch(queryClient)` on the server and `use({ params: { page: 1 } })` in the browser are two entries, and the second one fetches again. See [the key shape](/docs/builder/react-query/keys-and-invalidation#the-key-shape).
:::

Set a `staleTime` on the browser's `QueryClient`, or hydrated data counts as stale and is refetched on mount.

## Choosing a helper

| Helper | Resolves with | On failure | Use it when |
| --- | --- | --- | --- |
| `prefetch` | nothing | resolves anyway | the page can render without the data |
| `fetch` | the data | rejects with the `EndpointError` | the server needs the data or must react to a failure |
| `ensure` | the data | rejects with the `EndpointError` | cached data of any age is good enough, as in a route loader |

A failed `prefetch` is silent on the server. The component then fetches in the browser and reports the failure through its hook or error boundary.

Use `fetch` when the server should answer differently:

```tsx
import { isEndpointError } from '@navios/builder'
import { notFound } from 'next/navigation'

try {
  const user = await userQuery.fetch(queryClient, { urlParams: { userId } })
  // user is available for metadata, redirects, further requests
} catch (error) {
  if (isEndpointError(error) && error.status === 404) notFound()
  throw error
}
```

`ensure` suits client-side route loaders, where a cached value should win over a request:

```ts
export const userLoader =
  (queryClient: QueryClient) =>
  ({ params }: { params: { userId: string } }) =>
    userQuery.ensure(queryClient, { urlParams: { userId: params.userId } })
```

On an infinite query the three helpers load the first page.

## A client per request

A builder has one HTTP client, shared by every call. On a server that is the wrong scope: each incoming request has its own cookies or token. `setHttpClient` binds an HTTP client to a `QueryClient`, and every query, infinite query and mutation that runs through that `QueryClient` uses it instead of the builder's.

```tsx
import { create } from '@navios/http'
import { setHttpClient } from '@navios/react-query'
import { QueryClient } from '@tanstack/react-query'
import { cookies } from 'next/headers'

const queryClient = new QueryClient()

setHttpClient(
  queryClient,
  create({
    baseURL: process.env.API_URL,
    headers: { cookie: (await cookies()).toString() },
  }),
)

await userQuery.prefetch(queryClient, { urlParams: { userId } })
```

Since a server creates one `QueryClient` per request, the binding isolates requests without any global state. A `QueryClient` without a binding, such as the one in the browser, keeps using the builder's client.

- `setHttpClient(queryClient, client)` binds; `setHttpClient(queryClient, null)` removes the binding.
- `getHttpClient(queryClient)` returns the bound client, or `undefined`.

The bound client is any object that satisfies Builder's [HTTP client](/docs/builder/essentials/http-client) contract.

## What can be dehydrated

Query data must survive serialization to cross from server to browser. JSON responses do. So does a `withResponse: true` entry, because its headers are stored as a plain record. A `Blob` or a stream does not, so prefetch those in the browser instead.

Related: [Cache helpers](/docs/builder/react-query/queries#cache-helpers), [Keys and invalidation](/docs/builder/react-query/keys-and-invalidation).
