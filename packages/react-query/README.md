# @navios/react-query

Type-safe React Query integration for Navios API client with Zod schema validation.

## Features

- **Type Safety** - Full TypeScript support with Zod schema inference
- **Schema Validation** - Request and response validation using Zod schemas
- **React Query Integration** - Seamless integration with TanStack Query v5
- **Declarative API** - Define endpoints once, use everywhere
- **URL Parameters** - Built-in support for parameterized URLs (`/users/$userId`)
- **Optimistic Updates** - First-class helpers via `createOptimisticUpdate`
- **SSR/RSC Support** - Built-in prefetch helpers for server-side rendering
- **Error Schema Support** - Type-safe error handling with discriminated unions
- **Stream Support** - Handle file downloads and blob responses

## Installation

```bash
npm install @navios/react-query @navios/builder @navios/http zod @tanstack/react-query
```

## Quick Start

```typescript
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { declareClient } from '@navios/react-query'

import { z } from 'zod/v4'

// Create the API builder
const api = builder({})
api.provideClient(create({ baseURL: 'https://api.example.com' }))

// Create the client with optional defaults
const client = declareClient({
  api,
})
```

## Queries

### Basic Query

```typescript
const getUsers = client.query({
  method: 'GET',
  url: '/users',
  responseSchema: z.array(z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
  })),
})

// In a component
function UsersList() {
  const { data } = getUsers.useSuspense({})
  return (
    <ul>
      {data.map(user => <li key={user.id}>{user.name}</li>)}
    </ul>
  )
}
```

### Query with URL Parameters

```typescript
const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
  }),
})

function UserProfile({ userId }: { userId: string }) {
  const { data } = getUser.useSuspense({
    urlParams: { userId },
  })
  return <h1>{data.name}</h1>
}
```

### Query with Query Parameters

```typescript
const searchUsers = client.query({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().default(1),
    limit: z.number().default(10),
    search: z.string().optional(),
  }),
  responseSchema: z.object({
    users: z.array(UserSchema),
    total: z.number(),
  }),
})

function UsersPage() {
  const { data } = searchUsers.useSuspense({
    params: { page: 1, limit: 20, search: 'john' },
  })
  return <div>Found {data.total} users</div>
}
```

### Query with Response Transformation

```typescript
const getUsers = client.query({
  method: 'GET',
  url: '/users',
  responseSchema: z.discriminatedUnion('success', [
    z.object({
      success: z.literal(true),
      data: z.array(UserSchema),
    }),
    z.object({
      success: z.literal(false),
      error: z.object({ message: z.string() }),
    }),
  ]),
  processResponse: (response) => {
    if (!response.success) {
      throw new Error(response.error.message)
    }
    return response.data
  },
})
```

### Query with Error Handling

```typescript
const getUsers = client.query({
  method: 'GET',
  url: '/users',
  responseSchema: z.array(UserSchema),
  onFail: (error) => {
    // Called when the endpoint throws an error
    // Note: The error is still thrown after this callback
    console.error('Failed to fetch users:', error)
    // You can log to error tracking service, show toast, etc.
  },
})
```

### Query Helpers

```typescript
// Get query options for use with useQuery
const options = getUsers({ params: { page: 1 } })

// Helper hooks
const { data } = getUsers.use({ params: { page: 1 } })
const { data } = getUsers.useSuspense({ params: { page: 1 } })

// Invalidation
const queryClient = useQueryClient()
getUsers.invalidate(queryClient, { params: { page: 1 } })
getUsers.invalidateAll(queryClient, {}) // Invalidate all pages

// Access query key creator
const queryKey = getUsers.queryKey.dataTag({ params: { page: 1 } })
// Use with queryClient.getQueryData(queryKey), etc.
```

## Infinite Queries

```typescript
const getUsers = client.infiniteQuery({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    cursor: z.string().optional(),
    limit: z.number().default(20),
  }),
  responseSchema: z.object({
    users: z.array(UserSchema),
    nextCursor: z.string().nullable(),
  }),
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
})

function InfiniteUsersList() {
  const { data, fetchNextPage, hasNextPage } = getUsers.useSuspense({
    params: { limit: 20 },
  })

  return (
    <div>
      {data.pages.flatMap(page =>
        page.users.map(user => <UserCard key={user.id} user={user} />)
      )}
      {hasNextPage && (
        <button onClick={() => fetchNextPage()}>Load More</button>
      )}
    </div>
  )
}
```

## Mutations

### Basic Mutation

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
  }),
  processResponse: (data) => data,
})

function CreateUserForm() {
  const { mutateAsync, isPending } = createUser()

  const handleSubmit = async (formData: FormData) => {
    await mutateAsync({
      data: {
        name: formData.get('name') as string,
        email: formData.get('email') as string,
      },
    })
  }

  return <form onSubmit={handleSubmit}>...</form>
}
```

### Mutation with URL Parameters

```typescript
const updateUser = client.mutation({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: z.object({
    name: z.string(),
  }),
  responseSchema: UserSchema,
  processResponse: (data) => data,
})

function EditUserForm({ userId }: { userId: string }) {
  const { mutateAsync } = updateUser()

  const handleSubmit = async (name: string) => {
    await mutateAsync({
      urlParams: { userId },
      data: { name },
    })
  }

  return <form>...</form>
}
```

### Mutation with Callbacks and Optimistic Updates

```typescript
const updateUser = client.mutation({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: z.object({ name: z.string() }),
  responseSchema: UserSchema,
  processResponse: (data) => data,

  // Provide context (e.g., queryClient) via hook
  useContext: () => {
    const queryClient = useQueryClient()
    return { queryClient }
  },

  // Called before mutation - return value available as context.onMutateResult
  onMutate: async (variables, context) => {
    // Cancel outgoing queries
    await context.queryClient.cancelQueries({
      queryKey: ['users', variables.urlParams.userId],
    })

    // Snapshot previous value
    const previousUser = context.queryClient.getQueryData([
      'users',
      variables.urlParams.userId,
    ])

    // Optimistically update
    context.queryClient.setQueryData(['users', variables.urlParams.userId], {
      ...previousUser,
      name: variables.data.name,
    })

    return { previousUser }
  },

  // Called on success
  onSuccess: (data, variables, context) => {
    context.queryClient.invalidateQueries({ queryKey: ['users'] })
  },

  // Called on error - rollback optimistic update
  onError: (error, variables, context) => {
    if (context.onMutateResult?.previousUser) {
      context.queryClient.setQueryData(
        ['users', variables.urlParams.userId],
        context.onMutateResult.previousUser,
      )
    }
  },

  // Called on both success and error
  onSettled: (data, error, variables, context) => {
    context.queryClient.invalidateQueries({
      queryKey: ['users', variables.urlParams.userId],
    })
  },
})
```

### DELETE Mutation

```typescript
const deleteUser = client.mutation({
  method: 'DELETE',
  url: '/users/$userId',
  responseSchema: z.object({ success: z.boolean() }),
  processResponse: (data) => data,
})

const { mutateAsync } = deleteUser()
await mutateAsync({ urlParams: { userId: '123' } })
```

### Mutation with useKey (Scoped Mutations)

When `useKey` is true, mutations are scoped by URL parameters, preventing parallel mutations to the same resource:

```typescript
const updateUser = client.mutation({
  method: 'PUT',
  url: '/users/$userId',
  useKey: true,
  requestSchema: UpdateUserSchema,
  responseSchema: UserSchema,
  processResponse: (data) => data,
})

// With useKey, you must pass urlParams when calling the hook
const { mutateAsync, isPending } = updateUser({
  urlParams: { userId: '123' },
})

// Check if any mutation for this user is in progress
const isMutating = updateUser.useIsMutating({ userId: '123' })
```

## Stream Endpoints (File Downloads)

```typescript
// Define stream endpoint
const downloadFile = api.declareStream({
  method: 'GET',
  url: '/files/$fileId/download',
})

// Create mutation from stream endpoint
const useDownloadFile = client.mutationFromEndpoint(downloadFile, {
  // processResponse is optional - defaults to returning Blob
  processResponse: (blob) => URL.createObjectURL(blob),

  onSuccess: (url, variables, context) => {
    window.open(url)
  },
})

function DownloadButton({ fileId }: { fileId: string }) {
  const { mutate, isPending } = useDownloadFile()

  return (
    <button
      onClick={() => mutate({ urlParams: { fileId } })}
      disabled={isPending}
    >
      {isPending ? 'Downloading...' : 'Download'}
    </button>
  )
}
```

## Using Existing Endpoints

If you have endpoints defined separately, you can use them with the client:

### Query from Endpoint

```typescript
// Define endpoint separately
const getUserEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: UserSchema,
})

// Create query from endpoint
const getUser = client.queryFromEndpoint(getUserEndpoint, {
  processResponse: (data) => data,
})

// Use in component
function UserProfile({ userId }: { userId: string }) {
  const { data } = getUser.useSuspense({
    urlParams: { userId },
  })
  return <div>{data.name}</div>
}
```

### Infinite Query from Endpoint

```typescript
const getUsersEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    cursor: z.string().optional(),
    limit: z.number().default(20),
  }),
  responseSchema: z.object({
    users: z.array(UserSchema),
    nextCursor: z.string().nullable(),
  }),
})

const getUsers = client.infiniteQueryFromEndpoint(getUsersEndpoint, {
  processResponse: (data) => data,
  getNextPageParam: (lastPage, allPages) => lastPage.nextCursor ?? undefined,
})

function InfiniteUsersList() {
  const { data, fetchNextPage } = getUsers.useSuspense({
    params: { limit: 20 },
  })
  // ... use data
}
```

### Mutation from Endpoint

```typescript
const updateUserEndpoint = api.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: z.object({ name: z.string() }),
  responseSchema: UserSchema,
})

const updateUser = client.mutationFromEndpoint(updateUserEndpoint, {
  processResponse: (data) => data,
  useContext: () => {
    const queryClient = useQueryClient()
    return { queryClient }
  },
  onSuccess: (data, variables, context) => {
    context.queryClient.invalidateQueries({ queryKey: ['users'] })
    console.log('Updated:', data)
  },
  onError: (error, variables, context) => {
    console.error('Update failed:', error)
  },
})
```

## Multipart Mutations (File Uploads)

```typescript
const uploadAvatar = client.multipartMutation({
  method: 'POST',
  url: '/users/$userId/avatar',
  requestSchema: z.object({
    file: z.instanceof(File),
  }),
  responseSchema: z.object({
    url: z.string(),
  }),
  processResponse: (data) => data,
})

function AvatarUpload({ userId }: { userId: string }) {
  const { mutateAsync } = uploadAvatar()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const result = await mutateAsync({
        urlParams: { userId },
        data: { file },
      })
      console.log('Uploaded to:', result.url)
    }
  }

  return <input type="file" onChange={handleFileChange} />
}
```

## SSR/RSC Prefetch Helpers

For server-side rendering and React Server Components, use the prefetch helpers:

```typescript
import { createPrefetchHelper, prefetchAll } from '@navios/react-query'
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'

// Create prefetch helper from your query
const userPrefetch = createPrefetchHelper(getUser)

// Server Component
async function UserPage({ userId }: { userId: string }) {
  const queryClient = new QueryClient()

  await userPrefetch.prefetch(queryClient, { urlParams: { userId } })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <UserProfile userId={userId} />
    </HydrationBoundary>
  )
}
```

### Batch Prefetching

```typescript
// Create multiple helpers at once
const prefetchers = createPrefetchHelpers({
  user: getUser,
  posts: getUserPosts,
})

// Or prefetch different queries in parallel
await prefetchAll(queryClient, [
  { helper: userPrefetch, params: { urlParams: { userId } } },
  { helper: postsPrefetch, params: { urlParams: { userId }, params: { limit: 10 } } },
])
```

### Helper Methods

- `prefetch(queryClient, params)` - Prefetch data on the server
- `ensureData(queryClient, params)` - Ensure data exists, returns the data
- `getQueryOptions(params)` - Get raw query options for customization
- `prefetchMany(queryClient, paramsList)` - Prefetch multiple queries in parallel

## Optimistic Update Helpers

Simplify optimistic updates with the `createOptimisticUpdate` helper:

```typescript
import { createOptimisticUpdate } from '@navios/react-query'

const updateUser = client.mutation({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: updateUserSchema,
  responseSchema: userSchema,
  processResponse: (data) => data,
  useContext: () => ({ queryClient: useQueryClient() }),
  ...createOptimisticUpdate({
    queryKey: ['users', userId],
    updateFn: (oldData, variables) => ({
      ...oldData,
      ...variables.data,
    }),
    rollbackOnError: true,    // default
    invalidateOnSettled: true, // default
  }),
})
```

### Multi-Query Optimistic Updates

When a mutation affects multiple cached queries:

```typescript
import { createMultiOptimisticUpdate } from '@navios/react-query'

const updateUser = client.mutation({
  // ...config
  ...createMultiOptimisticUpdate([
    {
      queryKey: ['users', userId],
      updateFn: (oldData, variables) => ({ ...oldData, ...variables.data }),
    },
    {
      queryKey: ['users'],
      updateFn: (oldList, variables) =>
        (oldList ?? []).map((u) =>
          u.id === userId ? { ...u, ...variables.data } : u
        ),
    },
  ]),
})
```

## Error Schema Support

When using `useDiscriminatorResponse: true` mode, API errors are returned as data instead of being thrown. This enables type-safe error discrimination:

```typescript
const api = builder({ useDiscriminatorResponse: true })

const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  errorSchema: {
    400: z.object({ error: z.string(), code: z.number() }),
    404: z.object({ notFound: z.literal(true) }),
    500: z.object({ serverError: z.string() }),
  },
  processResponse: (data) => {
    // data is typed as: User | { error: string, code: number } | { notFound: true } | { serverError: string }
    if ('error' in data) {
      return { ok: false as const, error: data.error }
    }
    if ('notFound' in data) {
      return { ok: false as const, error: 'User not found' }
    }
    if ('serverError' in data) {
      return { ok: false as const, error: data.serverError }
    }
    return { ok: true as const, user: data }
  },
})

// In your component
function UserProfile({ userId }: { userId: string }) {
  const result = getUser.useSuspense({ urlParams: { userId } })

  if (!result.ok) {
    return <ErrorMessage error={result.error} />
  }

  return <div>{result.user.name}</div>
}
```

## API Reference

### `declareClient(options)`

Creates a client instance for making type-safe queries and mutations.

**Options:**

- `api` - The API builder created with `@navios/builder`
- `defaults` - Optional default options applied to all queries/mutations:
  - `keyPrefix?: string[]` - Prefix added to all query/mutation keys
  - `keySuffix?: string[]` - Suffix added to all query/mutation keys

**Example:**

```typescript
const client = declareClient({
  api,
  defaults: {
    keyPrefix: ['api', 'v1'], // All keys will start with ['api', 'v1']
    keySuffix: ['cache'], // All keys will end with ['cache']
  },
})
```

**Returns:** `ClientInstance` with the following methods:

### Query Methods

- `client.query(config)` - Create a query
- `client.queryFromEndpoint(endpoint, options)` - Create a query from an existing endpoint
- `client.infiniteQuery(config)` - Create an infinite query
- `client.infiniteQueryFromEndpoint(endpoint, options)` - Create an infinite query from an endpoint

### Mutation Methods

- `client.mutation(config)` - Create a mutation
- `client.mutationFromEndpoint(endpoint, options)` - Create a mutation from an existing endpoint
- `client.multipartMutation(config)` - Create a multipart/form-data mutation

### Query Config

| Property          | Type                                     | Required | Description                                                      |
| ----------------- | ---------------------------------------- | -------- | ---------------------------------------------------------------- |
| `method`          | `'GET' \| 'POST' \| 'HEAD' \| 'OPTIONS'` | Yes      | HTTP method                                                      |
| `url`             | `string`                                 | Yes      | URL pattern (e.g., `/users/$userId`)                             |
| `responseSchema`  | `ZodSchema`                              | Yes      | Zod schema for response validation                               |
| `querySchema`     | `ZodObject`                              | No       | Zod schema for query parameters                                  |
| `requestSchema`   | `ZodSchema`                              | No       | Zod schema for request body (POST queries)                       |
| `processResponse` | `(data) => Result`                       | No       | Transform the response                                           |
| `onFail`          | `(error) => void`                        | No       | Called when the endpoint throws an error (error is still thrown) |
| `keyPrefix`       | `string[]`                               | No       | Prefix to add to query keys (useful for namespacing)             |
| `keySuffix`       | `string[]`                               | No       | Suffix to add to query keys                                      |

### Mutation Config

| Property          | Type                                        | Required | Description                          |
| ----------------- | ------------------------------------------- | -------- | ------------------------------------ |
| `method`          | `'POST' \| 'PUT' \| 'PATCH' \| 'DELETE'`    | Yes      | HTTP method                          |
| `url`             | `string`                                    | Yes      | URL pattern (e.g., `/users/$userId`) |
| `responseSchema`  | `ZodSchema`                                 | Yes      | Zod schema for response validation   |
| `requestSchema`   | `ZodSchema`                                 | No       | Zod schema for request body          |
| `querySchema`     | `ZodObject`                                 | No       | Zod schema for query parameters      |
| `processResponse` | `(data) => Result`                          | No       | Transform the response               |
| `useKey`          | `boolean`                                   | No       | Enable mutation key for scoping      |
| `useContext`      | `() => Context`                             | No       | Hook to provide context to callbacks |
| `onMutate`        | `(variables, context) => onMutateResult`    | No       | Called before mutation               |
| `onSuccess`       | `(data, variables, context) => void`        | No       | Called on success                    |
| `onError`         | `(error, variables, context) => void`       | No       | Called on error                      |
| `onSettled`       | `(data, error, variables, context) => void` | No       | Called on completion                 |

### Context Object

The context passed to mutation callbacks includes:

- Properties from `useContext()` return value
- `mutationId` - TanStack Query mutation ID
- `meta` - Mutation metadata
- `onMutateResult` - Return value from `onMutate` (in `onSuccess`, `onError`, `onSettled`)

## Migration to 1.0.0

See [CHANGELOG.md](./CHANGELOG.md) for full migration guide.

### From 0.7.x

- **Type file reorganization** - If importing internal types, update paths to use `client/types/*.mts`

### From 0.5.x to 0.6.x

- Mutation callbacks now receive `(data, variables, context)` instead of `(queryClient, data, variables)`
- Use `useContext` hook to provide `queryClient` and other dependencies
- New `onMutate` and `onSettled` callbacks for optimistic updates

## License

MIT
