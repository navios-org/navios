---
sidebar_position: 3
---

# SSR & Prefetching

Server-side rendering and React Server Components require prefetching data on the server. `@navios/react-query` provides utilities to simplify this process.

## Overview

When rendering on the server, you need to:

1. Create a `QueryClient` instance
2. Prefetch data before rendering
3. Dehydrate the cache state
4. Hydrate on the client

The prefetch helpers abstract away the boilerplate and provide a type-safe API.

## Basic Usage

### Creating a Prefetch Helper

```typescript
import { createPrefetchHelper } from '@navios/react-query'

// Your existing query
const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  processResponse: (data) => data,
})

// Create prefetch helper
const userPrefetch = createPrefetchHelper(getUser)
```

### Using in Server Components (Next.js App Router)

```tsx
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'

async function UserPage({ params }: { params: { userId: string } }) {
  const queryClient = new QueryClient()

  await userPrefetch.prefetch(queryClient, {
    urlParams: { userId: params.userId },
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <UserProfile userId={params.userId} />
    </HydrationBoundary>
  )
}
```

### Using in getServerSideProps (Next.js Pages Router)

```tsx
export async function getServerSideProps({ params }) {
  const queryClient = new QueryClient()

  await userPrefetch.prefetch(queryClient, {
    urlParams: { userId: params.userId },
  })

  return {
    props: {
      dehydratedState: dehydrate(queryClient),
    },
  }
}

function UserPage({ dehydratedState }) {
  return (
    <HydrationBoundary state={dehydratedState}>
      <UserProfile />
    </HydrationBoundary>
  )
}
```

## Prefetch Helper Methods

### prefetch

Prefetch data into the query cache. Does not return data.

```typescript
await userPrefetch.prefetch(queryClient, {
  urlParams: { userId: '123' },
})
```

### ensureData

Ensure data exists in cache. Returns the data if found, otherwise fetches it.

```typescript
const userData = await userPrefetch.ensureData(queryClient, {
  urlParams: { userId: '123' },
})

console.log('User:', userData.name)
```

### getQueryOptions

Get raw query options for advanced use cases.

```typescript
const options = userPrefetch.getQueryOptions({
  urlParams: { userId: '123' },
})

// Customize before prefetching
await queryClient.prefetchQuery({
  ...options,
  staleTime: 60000, // Custom stale time for prefetch
})
```

### prefetchMany

Prefetch multiple queries with the same helper in parallel.

```typescript
await userPrefetch.prefetchMany(queryClient, [
  { urlParams: { userId: '1' } },
  { urlParams: { userId: '2' } },
  { urlParams: { userId: '3' } },
])
```

## Batch Prefetching

### createPrefetchHelpers

Create multiple prefetch helpers at once from a record of queries.

```typescript
import { createPrefetchHelpers } from '@navios/react-query'

const queries = {
  user: client.query({
    method: 'GET',
    url: '/users/$userId',
    responseSchema: userSchema,
  }),
  posts: client.query({
    method: 'GET',
    url: '/users/$userId/posts',
    responseSchema: postsSchema,
  }),
  profile: client.query({
    method: 'GET',
    url: '/users/$userId/profile',
    responseSchema: profileSchema,
  }),
}

const prefetchers = createPrefetchHelpers(queries)

// Use each prefetcher
await prefetchers.user.prefetch(queryClient, { urlParams: { userId } })
await prefetchers.posts.prefetch(queryClient, { urlParams: { userId } })
```

### prefetchAll

Prefetch multiple different queries in parallel.

```typescript
import { prefetchAll } from '@navios/react-query'

const userPrefetch = createPrefetchHelper(getUser)
const postsPrefetch = createPrefetchHelper(getUserPosts)
const profilePrefetch = createPrefetchHelper(getUserProfile)

async function DashboardPage({ userId }: { userId: string }) {
  const queryClient = new QueryClient()

  await prefetchAll(queryClient, [
    { helper: userPrefetch, params: { urlParams: { userId } } },
    { helper: postsPrefetch, params: { urlParams: { userId }, params: { limit: 10 } } },
    { helper: profilePrefetch, params: { urlParams: { userId } } },
  ])

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Dashboard userId={userId} />
    </HydrationBoundary>
  )
}
```

## Complete Example

Here's a complete example with Next.js App Router:

```tsx
// lib/queries.ts
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { declareClient, createPrefetchHelper } from '@navios/react-query'
import { z } from 'zod'

const api = builder({})
api.provideClient(create({ baseURL: process.env.API_URL }))

const client = declareClient({ api })

export const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  processResponse: (data) => data,
})

export const getUserPosts = client.query({
  method: 'GET',
  url: '/users/$userId/posts',
  querySchema: z.object({
    page: z.number().default(1),
    limit: z.number().default(10),
  }),
  responseSchema: z.object({
    posts: z.array(z.object({
      id: z.string(),
      title: z.string(),
    })),
    total: z.number(),
  }),
  processResponse: (data) => data,
})

export const userPrefetch = createPrefetchHelper(getUser)
export const postsPrefetch = createPrefetchHelper(getUserPosts)
```

```tsx
// app/users/[userId]/page.tsx
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { userPrefetch, postsPrefetch } from '@/lib/queries'
import { UserProfile } from '@/components/UserProfile'

export default async function UserPage({ params }: { params: { userId: string } }) {
  const queryClient = new QueryClient()

  // Prefetch in parallel
  await Promise.all([
    userPrefetch.prefetch(queryClient, {
      urlParams: { userId: params.userId },
    }),
    postsPrefetch.prefetch(queryClient, {
      urlParams: { userId: params.userId },
      params: { page: 1, limit: 10 },
    }),
  ])

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <UserProfile userId={params.userId} />
    </HydrationBoundary>
  )
}
```

```tsx
// components/UserProfile.tsx
'use client'

import { getUser, getUserPosts } from '@/lib/queries'

export function UserProfile({ userId }: { userId: string }) {
  // Data is already in cache from server prefetch
  const user = getUser.useSuspense({ urlParams: { userId } })
  const posts = getUserPosts.useSuspense({
    urlParams: { userId },
    params: { page: 1, limit: 10 },
  })

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
      <h2>Posts ({posts.total})</h2>
      <ul>
        {posts.posts.map((post) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </div>
  )
}
```

## Error Handling

Errors during prefetch can be handled in several ways:

### Silent Failures

Let errors fail silently - the client will re-fetch:

```typescript
try {
  await userPrefetch.prefetch(queryClient, { urlParams: { userId } })
} catch {
  // Ignore - client will fetch
}
```

### Use ensureData with Error Boundary

```typescript
try {
  const user = await userPrefetch.ensureData(queryClient, { urlParams: { userId } })
} catch (error) {
  // Handle error (e.g., redirect to 404)
  notFound()
}
```

## Best Practices

### Parallel Prefetching

Always prefetch independent queries in parallel:

```typescript
// ✅ Good - parallel
await Promise.all([
  userPrefetch.prefetch(queryClient, { urlParams: { userId } }),
  postsPrefetch.prefetch(queryClient, { urlParams: { userId } }),
])

// ❌ Bad - sequential
await userPrefetch.prefetch(queryClient, { urlParams: { userId } })
await postsPrefetch.prefetch(queryClient, { urlParams: { userId } })
```

### Create New QueryClient Per Request

```typescript
// ✅ Good - new QueryClient per request
async function Page() {
  const queryClient = new QueryClient()
  // ...
}

// ❌ Bad - shared QueryClient
const queryClient = new QueryClient()
async function Page() {
  // Uses shared instance
}
```

### Match Server and Client Parameters

Ensure the same parameters are used on server and client:

```typescript
// Server
await userPrefetch.prefetch(queryClient, {
  urlParams: { userId },
  params: { page: 1 },
})

// Client - must match
const user = getUser.useSuspense({
  urlParams: { userId },
  params: { page: 1 }, // Same params
})
```

## Next Steps

- [Queries](/docs/builder/react-query/guides/queries) - Learn about queries
- [Suspense](/docs/builder/react-query/guides/suspense) - Use Suspense for data fetching
- [API Reference](/docs/builder/react-query/api-reference) - Full API documentation
