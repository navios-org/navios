---
sidebar_position: 1
---

# @navios/react-query

A type-safe React Query integration library that bridges TanStack Query v5 with the `@navios/builder` API client. It provides a declarative, schema-validated approach to handling server state management in React applications.

**Package:** `@navios/react-query`
**License:** MIT
**Peer Dependencies:** `@navios/builder`, `@tanstack/react-query` (^5.51.21), `zod` (^3.25.0 || ^4.0.0)

## Installation

```bash
npm install @navios/react-query @navios/builder @tanstack/react-query zod
```

## Key Principles

- **Type-Safe** - End-to-end TypeScript support with Zod validation
- **Declarative** - Define API contracts once, reuse everywhere
- **Schema Validation** - Request/response validation at runtime
- **Smart Invalidation** - Hierarchical query key management
- **Suspense Ready** - First-class React Suspense support

## Quick Start

```typescript
// Setup client
import { builder } from '@navios/builder'
import { create } from 'navios'
import { declareClient } from '@navios/react-query'
import { z } from 'zod'

const api = builder()
api.provideClient(create({ baseURL: 'https://api.example.com' }))

const client = declareClient({ api })

// Define schema
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

// Create query
const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  processResponse: (data) => data,
})

// Use in component
function UserProfile({ userId }: { userId: string }) {
  const user = getUser.useSuspense({ urlParams: { userId } })
  return <div>{user.name}</div>
}
```

## Query API

### client.query()

Creates a query with inline configuration:

```typescript
const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  processResponse: (data) => data,
})

// Usage
const { data } = getUser.use({ urlParams: { userId: '123' } })
const data = getUser.useSuspense({ urlParams: { userId: '123' } })
```

### client.queryFromEndpoint()

Creates a query from a pre-declared endpoint:

```typescript
// shared/endpoints/users.ts
export const getUserEndpoint = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// client/queries/users.ts
const getUser = client.queryFromEndpoint(getUserEndpoint, {
  processResponse: (data) => data,
})
```

## Infinite Query API

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

// Usage
const { data, fetchNextPage, hasNextPage } = getUsers.use({
  params: { limit: 20 },
})
```

## Mutation API

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  responseSchema: userSchema,
  processResponse: (data) => data,
  onSuccess: (data) => console.log('User created:', data),
})

// Usage
const { mutate, isPending } = createUser()
mutate({ data: { name: 'John', email: 'john@example.com' } })
```

### Scoped Mutations

Enable `useKey` to track mutations per item:

```typescript
const updateUser = client.mutation({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: userUpdateSchema,
  responseSchema: userSchema,
  useKey: true,
  processResponse: (data) => data,
})

function UserCard({ userId }: { userId: string }) {
  const { mutate, isPending } = updateUser({ urlParams: { userId } })
  const isUpdating = updateUser.useIsMutating({ userId })

  return (
    <button onClick={() => mutate({ data: { name: 'New Name' } })}>
      {isUpdating ? 'Saving...' : 'Update'}
    </button>
  )
}
```

## Multipart Mutations

```typescript
const uploadFile = client.multipartMutation({
  method: 'POST',
  url: '/files',
  requestSchema: z.object({
    file: z.instanceof(File),
    description: z.string().optional(),
  }),
  responseSchema: z.object({ fileId: z.string() }),
  processResponse: (data) => data,
})
```

## Query Key Management

```typescript
const getUser = client.query({ url: '/users/$userId', ... })

// Full key with all parameters
getUser.queryKey.dataTag({ urlParams: { userId: '123' } })

// Partial key for filtering
getUser.queryKey.filterKey({ urlParams: { userId: '123' } })

// Invalidation
await getUser.invalidate(queryClient, { urlParams: { userId: '123' } })
await getUser.invalidateAll(queryClient, { urlParams: { userId: '123' } })
```

