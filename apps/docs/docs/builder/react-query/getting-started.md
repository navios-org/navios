---
sidebar_position: 1
---

# Getting Started

Get up and running with `@navios/react-query` in minutes. This guide will walk you through installation, setup, and your first type-safe query.

## Installation

```bash
npm install @navios/react-query @navios/builder @tanstack/react-query zod
# or
yarn add @navios/react-query @navios/builder @tanstack/react-query zod
# or
pnpm add @navios/react-query @navios/builder @tanstack/react-query zod
```

:::tip
`@navios/react-query` requires `@navios/builder`, `@tanstack/react-query`, and `zod` as peer dependencies.
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

Here's a complete example:

```typescript
// 1. Setup API builder
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { declareClient } from '@navios/react-query'
import { z } from 'zod'

const api = builder()
api.provideClient(create({ baseURL: 'https://api.example.com' }))

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
  processResponse: (data) => data,
})

// 5. Use in component
function UserProfile({ userId }: { userId: string }) {
  const { data, isLoading, error } = getUser.use({
    urlParams: { userId },
  })

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  
  return <div>{data.name}</div>
}
```

## What Just Happened?

1. **API Builder**: Created a builder instance and configured the HTTP client
2. **React Query Client**: Created a client that bridges Builder with React Query
3. **Schema Definition**: Used Zod to define the user data shape
4. **Query Creation**: Created a typed query with automatic query key generation
5. **Component Usage**: Used the query hook in a React component

## Using Suspense

For a cleaner API, use Suspense:

```typescript
import { Suspense } from 'react'

function UserProfile({ userId }: { userId: string }) {
  // useSuspense throws on error, so you need ErrorBoundary
  const user = getUser.useSuspense({ urlParams: { userId } })
  
  return <div>{user.name}</div>
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

## Next Steps

- [Overview](/docs/builder/react-query/overview) - Learn about key concepts
- [Queries](/docs/builder/react-query/guides/queries) - Deep dive into queries
- [Mutations](/docs/builder/react-query/guides/mutations) - Learn about mutations
- [Query Keys](/docs/builder/react-query/guides/query-keys) - Understand query key management
- [Invalidation](/docs/builder/react-query/guides/invalidation) - Learn about cache invalidation

## Example: Complete Setup

Here's a complete setup example:

```typescript
// api/index.ts
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { declareClient } from '@navios/react-query'

const api = builder()
api.provideClient(create({ baseURL: 'https://api.example.com' }))

export const client = declareClient({ api })

// api/queries/users.ts
import { client } from '../index'
import { z } from 'zod'

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

export const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  processResponse: (data) => data,
})

// components/UserProfile.tsx
import { getUser } from '../api/queries/users'

export function UserProfile({ userId }: { userId: string }) {
  const { data, isLoading, error } = getUser.use({
    urlParams: { userId },
  })

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  
  return (
    <div>
      <h1>{data.name}</h1>
      <p>{data.email}</p>
    </div>
  )
}
```

