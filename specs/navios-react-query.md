# @navios/react-query Specification

## Overview

`@navios/react-query` is a type-safe React Query integration library that bridges TanStack Query v5 with the `@navios/builder` API client. It provides a declarative, schema-validated approach to handling server state management in React applications using Zod for validation and TypeScript for type safety.

**Package:** `@navios/react-query`
**Version:** 2.0.0
**License:** MIT
**Peer Dependencies:** `@navios/builder`, `@tanstack/react-query` (^5.51.21), `zod` (^3.25.0 || ^4.0.0)

---

## Core Concepts

### Architecture Overview

```
declareClient(options)
├── query(config | endpoint, options?)
│   ├── use(params, { select? }) - useQuery hook
│   ├── useSuspense(params, { select? }) - useSuspenseQuery hook
│   ├── invalidate() - Invalidate specific query
│   └── invalidateAll() - Invalidate all matching queries
├── infiniteQuery(config | endpoint, options?)
│   ├── use(params, { select? }) - useInfiniteQuery hook
│   └── useSuspense(params, { select? }) - useSuspenseInfiniteQuery hook
├── mutation(config | endpoint, options?)
│   ├── mutationKey() - Get mutation key
│   └── useIsMutating() - Check mutation status
└── multipart(config)
    └── (same as mutation)
```

### Key Principles

- **Type-Safe** - End-to-end TypeScript support with Zod validation
- **Declarative** - Define API contracts once, reuse everywhere
- **Schema Validation** - Request/response validation at runtime
- **Smart Invalidation** - Hierarchical query key management
- **Suspense Ready** - First-class React Suspense support

---

## Client Setup

### declareClient

Creates a client instance for type-safe queries and mutations.

```typescript
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { declareClient } from '@navios/react-query'

// Create and configure the API builder
const api = builder()
api.provideClient(create({ baseURL: 'https://api.example.com' }))

// Create the React Query client
const client = declareClient({
  api,
  defaults: {
    keyPrefix: ['api'],  // Prepended to all query keys
    keySuffix: [],       // Appended to all query keys
  },
})
```

**Options:**

| Property   | Type                                  | Description                   |
| ---------- | ------------------------------------- | ----------------------------- |
| `api`      | `BuilderInstance`                     | The configured API builder    |
| `defaults` | `{ keyPrefix?: string[], keySuffix?: string[] }` | Default key configuration |

---

## Query API

### client.query()

Creates a query, accepting either an inline config or a pre-declared endpoint handler. There is no separate `queryFromEndpoint` — the single method covers both surfaces.

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
```

### client.query() from a pre-declared endpoint

Pass an `EndpointHandler<Options>` (produced by `api.declareEndpoint`) as the first argument; the options object is optional when the endpoint covers everything you need.

```typescript
// shared/endpoints/users.ts
import { builder } from '@navios/builder'

const API = builder()

export const getUserEndpoint = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})
```

```typescript
// client/queries/users.ts
const getUser = client.query(getUserEndpoint)
```

The `client.queryFromEndpoint` method was removed in v2 — `client.query` now covers both call shapes.

### Query Helper Methods

Every query returns an object with helper methods:

```typescript
const getUser = client.query({ ... })

// Hook usage
const { data } = getUser.use({ urlParams: { userId: '123' } })

// Suspense hook usage
const data = getUser.useSuspense({ urlParams: { userId: '123' } })

// Invalidation
await getUser.invalidate(queryClient, { urlParams: { userId: '123' } })

// Invalidate all queries for this URL (ignores query params)
await getUser.invalidateAll(queryClient, { urlParams: { userId: '123' } })

// Query key access
const key = getUser.queryKey.dataTag({ urlParams: { userId: '123' } })
const filterKey = getUser.queryKey.filterKey({ urlParams: { userId: '123' } })
```

### Query Arguments

```typescript
type QueryArgs<Config> = {
  urlParams?: UrlParams<Config['url']>  // From URL pattern (e.g., /users/$id)
  params?: Config['querySchema']         // Query string parameters
  data?: Config['requestSchema']         // Request body (for POST queries)
}
```

**Example with all argument types:**

```typescript
const searchUsers = client.query({
  method: 'POST',
  url: '/organizations/$orgId/users/search',
  querySchema: z.object({
    page: z.number().optional(),
    limit: z.number().optional(),
  }),
  requestSchema: z.object({
    query: z.string(),
    filters: z.array(z.string()).optional(),
  }),
  responseSchema: z.array(userSchema),
})

// Usage
const { data } = searchUsers.use({
  urlParams: { orgId: 'org-123' },
  params: { page: 1, limit: 20 },
  data: { query: 'john', filters: ['active'] },
})
```

---

## Infinite Query API

### client.infiniteQuery()

Creates an infinite query for paginated data.

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
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  initialPageParam: undefined,
})
```

### client.infiniteQuery() from a pre-declared endpoint

Pass an `EndpointHandler<Options>` as the first argument; the options object is required only for surface-specific fields like `getNextPageParam`.

```typescript
const getUsers = client.infiniteQuery(getUsersEndpoint, {
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  initialPageParam: undefined,
})
```

The `client.infiniteQueryFromEndpoint` method was removed in v2.

**Infinite Query Options:**

| Property              | Type                                    | Required | Description                     |
| --------------------- | --------------------------------------- | -------- | ------------------------------- |
| `getNextPageParam`    | `(lastPage, pages) => PageParam`        | Yes      | Extract next page cursor        |
| `getPreviousPageParam`| `(firstPage, pages) => PageParam`       | No       | Extract previous page cursor    |
| `initialPageParam`    | `PageParam`                             | Yes      | Initial page parameter          |

**Usage:**

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
      {data?.pages.flatMap(page => page.users).map(user => (
        <UserCard key={user.id} user={user} />
      ))}
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          Load More
        </button>
      )}
    </div>
  )
}
```

---

## Mutation API

### client.mutation()

Creates a mutation for data modification.

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  responseSchema: userSchema,
  onSuccess: (data, variables, context) => {
    console.log('User created:', data)
  },
})
```

### client.mutation() from a pre-declared endpoint

Pass an `EndpointHandler<Options>` (or `StreamHandler<Options>`, for file-download mutations) as the first argument.

```typescript
const createUser = client.mutation(createUserEndpoint, {
  onSuccess: (data, variables, context) => {
    console.log('User created:', data)
  },
})
```

The `client.mutationFromEndpoint` method was removed in v2.

### Mutation with URL Parameters

```typescript
const updateUser = client.mutation({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  responseSchema: userSchema,
})

// Usage
function UserEditor({ userId }: { userId: string }) {
  const { mutate, isPending } = updateUser()

  const handleSave = (data: UserUpdateData) => {
    mutate({
      urlParams: { userId },
      data,
    })
  }

  return <UserForm onSubmit={handleSave} disabled={isPending} />
}
```

### Scoped Mutations (useKey)

Enable `useKey` to scope mutations by URL parameters, allowing per-item mutation tracking.

```typescript
const updateUser = client.mutation({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: userUpdateSchema,
  responseSchema: userSchema,
  useKey: true,  // Enable scoping
})

// Must pass URL params to hook
function UserCard({ userId }: { userId: string }) {
  const { mutate, isPending } = updateUser({ urlParams: { userId } })

  // Check if THIS specific user is being updated
  const isUpdating = updateUser.useIsMutating({ userId })

  return (
    <div>
      <button onClick={() => mutate({ data: { name: 'New Name' } })}>
        {isUpdating ? 'Saving...' : 'Update'}
      </button>
    </div>
  )
}
```

### Mutation Options

| Property          | Type                                              | Description                           |
| ----------------- | ------------------------------------------------- | ------------------------------------- |
| `result`          | `'data' \| 'envelope'`                            | Endpoint return shape (forwarded to the endpoint declaration) |
| `unwrap`          | `'none' \| 'throw-on-error'`                      | How envelopes are surfaced to TanStack Query (default `'none'`) |
| `validateResponse`| `boolean`                                         | Skip runtime `responseSchema.parse()` when `false` |
| `useContext`      | `() => TContext`                                  | Hook to provide context               |
| `useKey`          | `boolean`                                         | Enable mutation key scoping           |
| `keyPrefix`       | `string[]`                                        | Prefix for mutation key (requires useKey) |
| `keySuffix`       | `string[]`                                        | Suffix for mutation key (requires useKey) |
| `onMutate`        | `(variables, context) => TOnMutateResult`         | Called before mutation                |
| `onSuccess`       | `(data, variables, context) => void`              | Called on success                     |
| `onError`         | `(error, variables, context) => void`             | Called on error                       |
| `onSettled`       | `(data, error, variables, context) => void`       | Called on completion                  |

The v1 `onFail` callback was removed. Register a global `onError` on the builder (`builder({ onError })`) for cross-cutting error handling; for envelope endpoints use `unwrap: 'throw-on-error'` to surface typed errors through TanStack Query's `error` channel.

### Mutation Arguments

```typescript
type MutationArgs<Config> = {
  urlParams?: UrlParams<Config['url']>  // From URL pattern
  data?: Config['requestSchema']         // Request body
  params?: Config['querySchema']         // Query parameters
}
```

---

## Envelope Mode & Unwrap

When an endpoint is declared with `result: 'envelope'` (see the [@navios/builder spec](./navios-builder.md) for the envelope shape — `{ data, error, response, status }`), every helper in `@navios/react-query` detects envelope mode and surfaces the full envelope by default. The `unwrap` option selects how the envelope is delivered to TanStack Query.

### `unwrap` values per surface

| Surface             | Allowed values                            | Default  | `data` channel        | `error` channel              |
| ------------------- | ----------------------------------------- | -------- | --------------------- | ---------------------------- |
| `query`             | `'none' \| 'throw-on-error'`              | `'none'` | envelope / body       | `null` / envelope `error`    |
| `infiniteQuery`     | `'none' \| 'throw-on-error' \| 'pages'`   | `'none'` | envelopes / bodies    | `null` / envelope `error`    |
| `mutation`          | `'none' \| 'throw-on-error'`              | `'none'` | envelope / body       | `null` / envelope `error`    |
| `multipart`         | `'none' \| 'throw-on-error'`              | `'none'` | envelope / body       | `null` / envelope `error`    |

**Semantics:**

- `'none'` — envelope is passed through unchanged. Both success and error are in `data` (use `envelope.error` to discriminate). `error` is always `null`.
- `'throw-on-error'` — envelope errors are thrown so TanStack Query routes them through the standard `error` channel. On success `data` is the unwrapped body.
- `'pages'` (infinite queries only) — each page is unwrapped before storage. `getNextPageParam` receives the unwrapped body. Envelope errors are thrown.

The `unwrap` field is ignored at runtime when the endpoint isn't envelope mode.

### Query example

```typescript
const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  errorSchema: { 404: notFoundSchema },
  result: 'envelope',
  unwrap: 'throw-on-error',
})

// data is User | undefined, error is EnvelopeError | null
const { data, error } = getUser.use({ urlParams: { userId: '123' } })
```

### Infinite query example

```typescript
const getUsers = client.infiniteQuery({
  method: 'GET',
  url: '/users',
  querySchema: z.object({ cursor: z.string().optional() }),
  responseSchema: pageSchema,
  result: 'envelope',
  unwrap: 'pages',
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  initialPageParam: undefined,
})
```

### Read-side projections with `select`

Endpoint-level `processResponse` was removed in v2. For queries and infinite queries, pass `select` to the per-call hook:

```typescript
const { data } = getUser.use(
  { urlParams: { userId } },
  { select: (user) => ({ ...user, displayName: user.name.toUpperCase() }) },
)
```

`select` runs on read (not in the cache-write path), so different consumers can project the same cached data differently without invalidating each other. In envelope mode with `unwrap: 'none'`, `select` receives the full envelope.

For mutations and multipart, there is no read-side `select` — transform inside `onSuccess` or in the caller.

See the [@navios/builder spec](./navios-builder.md) for the underlying envelope shape, `IsEnvelope` detector, and validation modes.

---

## Multipart Mutations

### client.multipart()

Creates a mutation for file uploads with form-data encoding. (Renamed from `client.multipartMutation` in v2.)

```typescript
const uploadFile = client.multipart({
  method: 'POST',
  url: '/files',
  requestSchema: z.object({
    file: z.instanceof(File),
    description: z.string().optional(),
  }),
  responseSchema: z.object({
    fileId: z.string(),
    url: z.string(),
  }),
})

// Usage
function FileUpload() {
  const { mutate, isPending } = uploadFile()

  const handleUpload = (file: File) => {
    mutate({
      data: { file, description: 'Profile photo' },
    })
  }

  return <input type="file" onChange={e => handleUpload(e.target.files[0])} />
}
```

---

## Context in Mutations

Use `useContext` to provide additional context to mutation callbacks.

```typescript
const updateUser = client.mutation({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: userUpdateSchema,
  responseSchema: userSchema,
  useContext: () => ({
    queryClient: useQueryClient(),
    toast: useToast(),
  }),
  onMutate: async (variables, context) => {
    // Cancel outgoing queries
    await context.queryClient.cancelQueries({ queryKey: ['users'] })

    // Snapshot previous value
    const previous = context.queryClient.getQueryData(['users', variables.urlParams.userId])

    // Optimistically update
    context.queryClient.setQueryData(
      ['users', variables.urlParams.userId],
      { ...previous, ...variables.data }
    )

    return { previous }
  },
  onError: (error, variables, context) => {
    // Rollback on error
    if (context.onMutateResult?.previous) {
      context.queryClient.setQueryData(
        ['users', variables.urlParams.userId],
        context.onMutateResult.previous
      )
    }
    context.toast.error('Failed to update user')
  },
  onSuccess: (data, variables, context) => {
    context.toast.success('User updated!')
  },
})
```

**Context Structure:**

```typescript
// In onMutate
context: {
  ...contextFromUseContext,  // Your provided context
  mutationId: string,        // TanStack Query mutation ID
  meta?: Record<string, unknown>,
}

// In onSuccess, onError, onSettled
context: {
  ...contextFromUseContext,
  mutationId: string,
  meta?: Record<string, unknown>,
  onMutateResult: TOnMutateResult | undefined,  // Return value from onMutate
}
```

---

## Query Key Management

### Key Structure

Query keys follow a hierarchical structure:

```
[...keyPrefix, ...urlParts, ...keySuffix, queryParams]
```

**Example:**

```typescript
// URL: /api/users/123?page=1
// keyPrefix: ['api']
// Key: ['api', 'users', '123', { page: 1 }]
```

### Key Methods

```typescript
const getUser = client.query({ url: '/users/$userId', ... })

// Full key with all parameters
getUser.queryKey.dataTag({ urlParams: { userId: '123' }, params: { include: 'posts' } })
// => ['users', '123', { include: 'posts' }]

// Partial key for filtering (URL params only)
getUser.queryKey.filterKey({ urlParams: { userId: '123' } })
// => ['users', '123']

// Get bound URL
getUser.queryKey.bindToUrl({ urlParams: { userId: '123' } })
// => '/users/123'
```

### Invalidation Patterns

```typescript
const queryClient = useQueryClient()

// Invalidate specific query (exact match)
await getUser.invalidate(queryClient, {
  urlParams: { userId: '123' },
  params: { include: 'posts' },
})

// Invalidate all queries for this user (ignores query params)
await getUser.invalidateAll(queryClient, {
  urlParams: { userId: '123' },
})

// Manual invalidation with filter key
await queryClient.invalidateQueries({
  queryKey: getUser.queryKey.filterKey({ urlParams: { userId: '123' } }),
})
```

---

## Stream Support

Handle streaming responses (returns Blob by default).

```typescript
// shared/endpoints/files.ts
export const downloadFileEndpoint = API.declareStream({
  method: 'GET',
  url: '/files/$fileId/download',
})
```

```typescript
// client/queries/files.ts
const downloadFileMutation = client.mutation(downloadFileEndpoint)

// Usage
function DownloadButton({ fileId }: { fileId: string }) {
  const { mutate, isPending, data } = downloadFileMutation()

  // Handle download when data is received
  useEffect(() => {
    if (data) {
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'file.pdf'
      a.click()
      URL.revokeObjectURL(url)
    }
  }, [data])

  return (
    <button onClick={() => mutate({ urlParams: { fileId } })} disabled={isPending}>
      {isPending ? 'Downloading...' : 'Download'}
    </button>
  )
}
```

**Alternative with onSuccess callback:**

```typescript
// Define mutation with onSuccess at declaration time
const downloadFileMutation = client.mutation(downloadFileEndpoint, {
  onSuccess: (blob) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'file.pdf'
    a.click()
    URL.revokeObjectURL(url)
  },
})
```

---

## Complete Example

```typescript
// shared/endpoints/users.ts
import { builder } from '@navios/builder'
import { z } from 'zod'

export const API = builder()

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

export const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().optional(),
    limit: z.number().optional(),
  }),
  responseSchema: z.object({
    users: z.array(userSchema),
    total: z.number(),
  }),
})

export const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: userSchema.omit({ id: true }),
  responseSchema: userSchema,
})

export const updateUser = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: userSchema.omit({ id: true }),
  responseSchema: userSchema,
})

export const deleteUser = API.declareEndpoint({
  method: 'DELETE',
  url: '/users/$userId',
  responseSchema: z.object({ success: z.boolean() }),
})
```

```typescript
// client/index.ts
import { create } from '@navios/http'
import { declareClient } from '@navios/react-query'
import { API } from '../shared/endpoints/users'

API.provideClient(create({ baseURL: 'https://api.example.com' }))

export const client = declareClient({ api: API })
```

```typescript
// client/queries/users.ts
import { useQueryClient } from '@tanstack/react-query'
import { client } from '../index'
import { getUser, getUsers, createUser, updateUser, deleteUser } from '../../shared/endpoints/users'

export const userQuery = client.query(getUser)

export const usersQuery = client.query(getUsers)

export const createUserMutation = client.mutation(createUser, {
  useContext: () => ({ queryClient: useQueryClient() }),
  onSuccess: (data, variables, context) => {
    context.queryClient.invalidateQueries({ queryKey: ['users'] })
  },
})

export const updateUserMutation = client.mutation(updateUser, {
  useKey: true,
  useContext: () => ({ queryClient: useQueryClient() }),
  onSuccess: (data, variables, context) => {
    context.queryClient.setQueryData(
      userQuery.queryKey.dataTag({ urlParams: { userId: data.id } }),
      data
    )
  },
})

export const deleteUserMutation = client.mutation(deleteUser, {
  useContext: () => ({ queryClient: useQueryClient() }),
  onSuccess: (data, variables, context) => {
    context.queryClient.invalidateQueries({ queryKey: ['users'] })
  },
})
```

```typescript
// components/UserList.tsx
import { Suspense } from 'react'
import { usersQuery, deleteUserMutation } from '../client/queries/users'

function UserListContent() {
  const { users, total } = usersQuery.useSuspense({ params: { page: 1, limit: 10 } })
  const { mutate: deleteUser } = deleteUserMutation()

  return (
    <div>
      <h1>Users ({total})</h1>
      <ul>
        {users.map(user => (
          <li key={user.id}>
            {user.name} ({user.email})
            <button onClick={() => deleteUser({ urlParams: { userId: user.id } })}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function UserList() {
  return (
    <Suspense fallback={<div>Loading users...</div>}>
      <UserListContent />
    </Suspense>
  )
}
```

```typescript
// components/UserProfile.tsx
import { Suspense } from 'react'
import { userQuery, updateUserMutation } from '../client/queries/users'

function UserProfileContent({ userId }: { userId: string }) {
  const user = userQuery.useSuspense({ urlParams: { userId } })
  const { mutate: updateUser, isPending } = updateUserMutation({ urlParams: { userId } })
  const isUpdating = updateUserMutation.useIsMutating({ userId })

  const handleUpdate = (data: { name: string; email: string }) => {
    updateUser({ data })
  }

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
      <UserForm
        defaultValues={user}
        onSubmit={handleUpdate}
        disabled={isPending || isUpdating}
      />
    </div>
  )
}

export function UserProfile({ userId }: { userId: string }) {
  return (
    <Suspense fallback={<div>Loading profile...</div>}>
      <UserProfileContent userId={userId} />
    </Suspense>
  )
}
```

---

## Best Practices

### 1. Define Endpoints in Shared Package

```typescript
// shared/endpoints/users.ts - Used by both server and client
export const getUser = API.declareEndpoint({ ... })
```

### 2. Use `select` for Read-Side Projections

Endpoint-level transformations no longer exist. For queries and infinite queries, pass `select` to the per-call hook — it runs on read, doesn't widen the cache type, and different consumers can project the same cached value differently.

```typescript
const getUser = client.query(getUserEndpoint)

// in a component
const { data } = getUser.use(
  { urlParams: { userId } },
  { select: (data) => ({ ...data, displayName: `${data.name} (${data.email})` }) },
)
```

For mutations and multipart, transform inside `onSuccess` or in the caller.

### 3. Use useKey for Per-Item Mutation Tracking

```typescript
const updateItem = client.mutation({
  url: '/items/$itemId',
  useKey: true,  // Track mutations per item
  ...
})

// Check specific item's mutation status
const isUpdating = updateItem.useIsMutating({ itemId: '123' })
```

### 4. Use Suspense for Cleaner Code

```typescript
// Recommended
const data = query.useSuspense(params)

// Instead of
const { data, isLoading, error } = query.use(params)
if (isLoading) return <Loading />
if (error) return <Error />
```

### 5. Invalidate Related Queries on Mutation

```typescript
const createUser = client.mutation({
  ...config,
  useContext: () => ({ queryClient: useQueryClient() }),
  onSuccess: (data, variables, context) => {
    // Invalidate users list
    context.queryClient.invalidateQueries({ queryKey: ['users'] })
  },
})
```

---

## API Reference Summary

### Client Methods

| Method                            | Purpose                                                  |
| --------------------------------- | -------------------------------------------------------- |
| `query(config \| ep, options?)`   | Create query from inline config OR pre-declared endpoint |
| `infiniteQuery(config \| ep, options?)` | Create infinite query from inline config OR endpoint |
| `mutation(config \| ep, options?)` | Create mutation from inline config OR endpoint           |
| `multipart(config)`               | Create multipart/file-upload mutation                    |

The legacy paired methods (`queryFromEndpoint`, `infiniteQueryFromEndpoint`, `mutationFromEndpoint`) and `multipartMutation` were removed in v2 — the surfaces above accept both call shapes.

### Query Helpers

| Method         | Purpose                                      |
| -------------- | -------------------------------------------- |
| `use(params)`  | Returns `UseQueryResult`                     |
| `useSuspense(params)` | Returns data directly (throws on error) |
| `invalidate(qc, params)` | Invalidate specific query            |
| `invalidateAll(qc, params)` | Invalidate all matching queries    |
| `queryKey.dataTag(params)` | Full query key                      |
| `queryKey.filterKey(params)` | Partial key for filtering         |
| `queryKey.bindToUrl(params)` | Resolved URL string               |

### Mutation Helpers

| Method               | Purpose                                    |
| -------------------- | ------------------------------------------ |
| `mutationKey()`      | Get mutation key (no useKey)               |
| `mutationKey(params)`| Get mutation key (with useKey)             |
| `useIsMutating()`    | Check if mutating (no useKey)              |
| `useIsMutating(params)` | Check if specific mutation active (useKey) |
