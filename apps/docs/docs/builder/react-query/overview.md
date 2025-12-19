---
sidebar_position: 2
---

# Overview

`@navios/react-query` is a type-safe React Query integration library that bridges TanStack Query v5 with the `@navios/builder` API client. It provides a declarative, schema-validated approach to handling server state management in React applications.

**Package:** `@navios/react-query`  
**License:** MIT  
**Peer Dependencies:** `@navios/builder`, `@tanstack/react-query` (^5.51.21), `zod` (^3.25.0 || ^4.0.0)

## Why Use React Query Integration?

### Type Safety

End-to-end TypeScript support with automatic type inference:

- Query parameters are typed from your endpoint definitions
- Response data is typed from your Zod schemas
- Mutation variables are type-checked
- Query keys are automatically generated and typed

### Automatic Query Key Management

Builder automatically generates hierarchical query keys:

```typescript
const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  processResponse: (data) => data,
})

// Automatic key generation
// Key: ['users', '123']
const key = getUser.queryKey.dataTag({ urlParams: { userId: '123' } })
```

### Suspense Support

First-class React Suspense support:

```typescript
function UserProfile({ userId }: { userId: string }) {
  const user = getUser.useSuspense({ urlParams: { userId } })
  // No loading/error checks needed!
  return <div>{user.name}</div>
}
```

### Optimistic Updates

Built-in support for optimistic updates with automatic rollback:

```typescript
const updateUser = client.mutation({
  // ...
  onMutate: async (variables, context) => {
    // Optimistically update UI
    context.queryClient.setQueryData(/* ... */)
  },
  onError: (error, variables, context) => {
    // Automatic rollback on error
  },
})
```

## Key Principles

- **Type-Safe** - End-to-end TypeScript support with Zod validation
- **Declarative** - Define API contracts once, reuse everywhere
- **Schema Validation** - Request/response validation at runtime
- **Smart Invalidation** - Hierarchical query key management
- **Suspense Ready** - First-class React Suspense support

## Architecture

```
┌─────────────────┐
│  React Component│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Query Hook     │  ← use() or useSuspense()
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  TanStack Query │  ← Query cache & state
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Builder Client │  ← Type-safe API calls
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  HTTP Client    │  ← Actual network request
└─────────────────┘
```

## Quick Start

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
  const user = getUser.useSuspense({ urlParams: { userId } })
  return <div>{user.name}</div>
}
```

## Features

### Queries

Type-safe queries with automatic cache management:

```typescript
const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  processResponse: (data) => data,
})

// Standard hook
const { data, isLoading, error } = getUser.use({ urlParams: { userId: '123' } })

// Suspense hook
const user = getUser.useSuspense({ urlParams: { userId: '123' } })
```

### Infinite Queries

Paginated data with infinite scroll support:

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

### Mutations

Type-safe mutations with optimistic updates:

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: userCreateSchema,
  responseSchema: userSchema,
  processResponse: (data) => data,
  useContext: () => ({ queryClient: useQueryClient() }),
  onSuccess: (data, variables, context) => {
    context.queryClient.invalidateQueries({ queryKey: ['users'] })
  },
})
```

### Query Key Management

Automatic query key generation and invalidation:

```typescript
// Invalidate specific query
await getUser.invalidate(queryClient, { urlParams: { userId: '123' } })

// Invalidate all matching queries
await getUser.invalidateAll(queryClient, { urlParams: { userId: '123' } })
```

## What's Next?

- [Getting Started](/docs/builder/react-query/getting-started) - Installation and setup
- [Queries](/docs/builder/react-query/guides/queries) - Learn about queries
- [Mutations](/docs/builder/react-query/guides/mutations) - Learn about mutations
- [Query Keys](/docs/builder/react-query/guides/query-keys) - Understand query key management
- [Suspense](/docs/builder/react-query/guides/suspense) - Use Suspense for cleaner code
- [Optimistic Updates](/docs/builder/react-query/guides/optimistic-updates) - Update UI optimistically

