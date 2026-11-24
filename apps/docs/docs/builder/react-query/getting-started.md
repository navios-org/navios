---
sidebar_position: 1
---

# Getting Started

Get up and running with `@navios/react-query` in minutes. This guide walks you through installation, setup, and your first type-safe query and mutation.

## Installation

```bash
npm install @navios/react-query @navios/builder @navios/http @tanstack/react-query zod
# or
yarn add @navios/react-query @navios/builder @navios/http @tanstack/react-query zod
# or
pnpm add @navios/react-query @navios/builder @navios/http @tanstack/react-query zod
```

:::tip
`@navios/react-query` requires `@navios/builder`, `@tanstack/react-query` (`^5.102.0`) as peer dependencies; `zod` is an optional peer, used throughout these docs. `@navios/http` is one possible HTTP client; any client accepted by the builder works.
:::

## Setup QueryClient

First, set up TanStack Query's `QueryClient` in your app:

```typescript
// App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Your app */}
    </QueryClientProvider>
  )
}
```

## Quick Start

```typescript
// 1. Setup API builder
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { declareClient } from '@navios/react-query'
import { z } from 'zod'

const api = builder({ client: create({ baseURL: 'https://api.example.com' }) })

// 2. Create React Query client
const client = declareClient({ api })

// 3. Define schema
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

// 4. Create query
const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// 5. Use in component
function UserProfile({ userId }: { userId: string }) {
  const { data, isPending, error } = getUser.use({ urlParams: { userId } })

  if (isPending) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return <div>{data.name}</div>
}
```

## What Just Happened?

1. **API Builder**: Created a builder instance with an HTTP client
2. **React Query Client**: `declareClient` returned `query`, `infiniteQuery` and `mutation` factories bound to that builder
3. **Schema Definition**: Used Zod to define the user data shape
4. **Query Creation**: `client.query` declared the endpoint and returned a query object with hooks, a cache key and cache helpers attached
5. **Component Usage**: `getUser.use(args)` is `useQuery` with the key, the request and the types filled in

## Your First Mutation

```typescript
const updateUser = client.mutation({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: z.object({ name: z.string() }),
  responseSchema: userSchema,
  // Refetch this user after a successful update
  invalidates: [(_data, variables) => getUser.key({ urlParams: variables.urlParams })],
})

function RenameButton({ userId }: { userId: string }) {
  const { mutate, isPending } = updateUser()

  return (
    <button
      disabled={isPending}
      onClick={() => mutate({ urlParams: { userId }, data: { name: 'Ada' } })}
    >
      Rename
    </button>
  )
}
```

## Handling Errors

A failed request rejects with the endpoint's `EndpointError`, so it shows up as `error` on the hook result. Declare an `errorSchema` to get typed error bodies:

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
      return <div>{error.body.message}</div> // typed from errorSchema[404]
    }
    return <div>Something went wrong</div>
  }

  return <div>{data.name}</div>
}
```

See [Typed Errors](/docs/builder/react-query/advanced/error-schemas) for every error kind.

## Using Suspense

```typescript
import { Suspense } from 'react'

function UserProfile({ userId }: { userId: string }) {
  // Suspends while loading and throws to the nearest ErrorBoundary on failure
  const { data } = getUser.useSuspense({ urlParams: { userId } })

  return <div>{data.name}</div>
}

function App() {
  return (
    <ErrorBoundary fallback={<div>Error!</div>}>
      <Suspense fallback={<div>Loading...</div>}>
        <UserProfile userId="123" />
      </Suspense>
    </ErrorBoundary>
  )
}
```

## Suggested File Layout

```typescript
// api/index.ts
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { declareClient } from '@navios/react-query'

export const api = builder({ client: create({ baseURL: 'https://api.example.com' }) })
export const client = declareClient({ api })

// api/users.ts
import { z } from 'zod'

import { client } from './index'

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

export const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// components/UserProfile.tsx
import { getUser } from '../api/users'

export function UserProfile({ userId }: { userId: string }) {
  const { data, isPending, error } = getUser.use({ urlParams: { userId } })

  if (isPending) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <div>
      <h1>{data.name}</h1>
      <p>{data.email}</p>
    </div>
  )
}
```

## Next Steps

- [Overview](/docs/builder/react-query/overview) - Learn about key concepts
- [Queries](/docs/builder/react-query/guides/queries) - Deep dive into queries
- [Mutations](/docs/builder/react-query/guides/mutations) - Learn about mutations
- [Query Keys](/docs/builder/react-query/guides/query-keys) - Understand query key management
- [Invalidation](/docs/builder/react-query/guides/invalidation) - Learn about cache invalidation
