---
sidebar_position: 4
---

# Best Practices

This guide covers best practices for using `@navios/react-query` effectively in your React applications.

## Organizing Queries and Mutations

### Separate Endpoints from Queries

```typescript
// ✅ Good - endpoints in shared package
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

### Group by Resource

```typescript
// ✅ Good - organized by resource
// client/queries/users.ts
export const getUser = client.query(...)
export const getUsers = client.query(...)

// client/mutations/users.ts
export const createUser = client.mutation(...)
export const updateUser = client.mutation(...)
export const deleteUser = client.mutation(...)
```

## Query Patterns

### Use Suspense When Possible

```typescript
// ✅ Good - cleaner with Suspense
function UserProfile({ userId }: { userId: string }) {
  const user = getUser.useSuspense({ urlParams: { userId } })
  return <div>{user.name}</div>
}

// ❌ More verbose without Suspense
function UserProfile({ userId }: { userId: string }) {
  const { data, isLoading, error } = getUser.use({ urlParams: { userId } })
  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  return <div>{data.name}</div>
}
```

### Use processResponse for Transformations

```typescript
// ✅ Good - transform at query level
const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  processResponse: (data) => ({
    ...data,
    displayName: `${data.firstName} ${data.lastName}`,
  }),
})

// ❌ Bad - transform in component
const getUser = client.query({ ... })
function Component() {
  const { data } = getUser.use({ ... })
  const displayName = `${data.firstName} ${data.lastName}`
}
```

## Mutation Patterns

### Always Invalidate Related Queries

```typescript
// ✅ Good - invalidate after mutation
const createUser = client.mutation({
  // ...
  useContext: () => ({ queryClient: useQueryClient() }),
  onSuccess: (data, variables, context) => {
    context.queryClient.invalidateQueries({ queryKey: ['users'] })
  },
})
```

### Use Optimistic Updates

```typescript
// ✅ Good - optimistic updates for better UX
const updateUser = client.mutation({
  // ...
  onMutate: async (variables, context) => {
    await context.queryClient.cancelQueries({ queryKey: ['users'] })
    const previous = context.queryClient.getQueryData(['users', variables.urlParams.userId])
    context.queryClient.setQueryData(['users', variables.urlParams.userId], {
      ...previous,
      ...variables.data,
    })
    return { previous }
  },
  onError: (error, variables, context) => {
    if (context.onMutateResult?.previous) {
      context.queryClient.setQueryData(
        ['users', variables.urlParams.userId],
        context.onMutateResult.previous
      )
    }
  },
})
```

### Use Scoped Mutations for Lists

```typescript
// ✅ Good - track mutations per item
const updateUser = client.mutation({
  // ...
  useKey: true,
})

function UserList() {
  return users.map((user) => (
    <UserCard key={user.id} user={user} />
  ))
}

function UserCard({ user }: { user: User }) {
  const { mutate } = updateUser({ urlParams: { userId: user.id } })
  const isUpdating = updateUser.useIsMutating({ userId: user.id })
  // ...
}
```

## Query Key Management

### Use Helper Methods

```typescript
// ✅ Good - use helper methods
await getUser.invalidate(queryClient, { urlParams: { userId: '123' } })
await getUser.invalidateAll(queryClient, { urlParams: { userId: '123' } })

// ❌ Bad - manual key construction
await queryClient.invalidateQueries({
  queryKey: ['users', '123'], // May not match actual key structure
})
```

### Invalidate Related Queries

```typescript
// ✅ Good - invalidate all related queries
const updateUser = client.mutation({
  // ...
  onSuccess: (data, variables, context) => {
    getUser.invalidateAll(context.queryClient, {
      urlParams: { userId: data.id },
    })
    getUserPosts.invalidateAll(context.queryClient, {
      urlParams: { userId: data.id },
    })
  },
})
```

## Error Handling

### Use Error Boundaries with Suspense

```typescript
// ✅ Good - ErrorBoundary handles errors
<ErrorBoundary fallback={<ErrorDisplay />}>
  <Suspense fallback={<LoadingSpinner />}>
    <UserProfile userId="123" />
  </Suspense>
</ErrorBoundary>
```

### Provide User-Friendly Messages

```typescript
// ✅ Good - user-friendly error messages
const createUser = client.mutation({
  // ...
  onError: (error, variables, context) => {
    if (error instanceof NaviosError) {
      context.toast.error('Failed to create user. Please try again.')
    } else {
      context.toast.error('An unexpected error occurred.')
    }
  },
})
```

## Performance

### Use Stale Time

```typescript
// ✅ Good - prevent unnecessary refetches
const { data } = getUser.use({
  urlParams: { userId },
  staleTime: 5 * 60 * 1000, // 5 minutes
})
```

### Prefetch Data

```typescript
// ✅ Good - prefetch on hover
function UserList() {
  const queryClient = useQueryClient()

  const handleMouseEnter = (userId: string) => {
    queryClient.prefetchQuery({
      queryKey: getUser.queryKey.dataTag({ urlParams: { userId } }),
      queryFn: () => getUser({ urlParams: { userId } }),
    })
  }

  return (
    <div>
      {users.map((user) => (
        <div
          key={user.id}
          onMouseEnter={() => handleMouseEnter(user.id)}
        >
          {user.name}
        </div>
      ))}
    </div>
  )
}
```

## Type Safety

### Let TypeScript Infer Types

```typescript
// ✅ Good - let TypeScript infer
const user = getUser.useSuspense({ urlParams: { userId: '123' } })
// user is automatically typed

// ❌ Bad - unnecessary type annotations
const user: User = getUser.useSuspense({ urlParams: { userId: '123' } })
```

### Extract Types When Needed

```typescript
// ✅ Good - extract types for reuse
type GetUserParams = Parameters<typeof getUser.use>[0]
type GetUserResponse = Awaited<ReturnType<typeof getUser.use>>['data']
```

## Common Patterns

### Conditional Queries

```typescript
// ✅ Good - use enabled option
const { data } = getUser.use({
  urlParams: { userId: userId! },
  enabled: !!userId,
})
```

### Dependent Queries

```typescript
// ✅ Good - chain queries
function UserPosts({ userId }: { userId: string }) {
  const { data: user } = getUser.use({ urlParams: { userId } })
  const { data: posts } = getPosts.use({
    urlParams: { userId },
    enabled: !!user,
  })
  // ...
}
```

## Next Steps

- [Getting Started](/docs/builder/react-query/getting-started) - Quick start guide
- [Queries](/docs/builder/react-query/guides/queries) - Learn about queries
- [Mutations](/docs/builder/react-query/guides/mutations) - Learn about mutations
- [API Reference](/docs/builder/react-query/api-reference) - Complete API documentation

