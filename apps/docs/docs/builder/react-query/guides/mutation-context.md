---
sidebar_position: 9
---

# Context in Mutations

Context allows you to access React hooks and other values in mutation callbacks. This is essential for accessing `QueryClient` and other React context.

## Basic Usage

Use `useContext` to provide context to mutation callbacks:

```typescript
const updateUser = client.mutation({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: userUpdateSchema,
  responseSchema: userSchema,
  processResponse: (data) => data,
  useContext: () => ({
    queryClient: useQueryClient(),
  }),
  onSuccess: (data, variables, context) => {
    // Access QueryClient from context
    context.queryClient.invalidateQueries({ queryKey: ['users'] })
  },
})
```

## Accessing QueryClient

The most common use case is accessing `QueryClient`:

```typescript
import { useQueryClient } from '@tanstack/react-query'

const updateUser = client.mutation({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: userUpdateSchema,
  responseSchema: userSchema,
  processResponse: (data) => data,
  useContext: () => ({
    queryClient: useQueryClient(),
  }),
  onSuccess: (data, variables, context) => {
    // Invalidate queries
    context.queryClient.invalidateQueries({ queryKey: ['users'] })
    
    // Update cache
    context.queryClient.setQueryData(
      getUser.queryKey.dataTag({ urlParams: { userId: data.id } }),
      data
    )
  },
})
```

## Custom Context

Provide any React hooks or values:

```typescript
const updateUser = client.mutation({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: userUpdateSchema,
  responseSchema: userSchema,
  processResponse: (data) => data,
  useContext: () => ({
    queryClient: useQueryClient(),
    toast: useToast(),
    router: useRouter(),
  }),
  onSuccess: (data, variables, context) => {
    context.toast.success('User updated!')
    context.router.push(`/users/${data.id}`)
  },
  onError: (error, variables, context) => {
    context.toast.error('Update failed')
  },
})
```

## Context in All Callbacks

Context is available in all mutation callbacks:

```typescript
const updateUser = client.mutation({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: userUpdateSchema,
  responseSchema: userSchema,
  processResponse: (data) => data,
  useContext: () => ({
    queryClient: useQueryClient(),
    toast: useToast(),
  }),
  onMutate: async (variables, context) => {
    // Context available in onMutate
    await context.queryClient.cancelQueries({ queryKey: ['users'] })
    return { previous: context.queryClient.getQueryData(['users']) }
  },
  onSuccess: (data, variables, context) => {
    // Context available in onSuccess
    context.toast.success('Updated!')
  },
  onError: (error, variables, context) => {
    // Context available in onError
    context.toast.error('Failed!')
  },
  onSettled: (data, error, variables, context) => {
    // Context available in onSettled
    context.queryClient.invalidateQueries({ queryKey: ['users'] })
  },
})
```

## Context Structure

### In onMutate

```typescript
context: {
  ...contextFromUseContext,  // Your provided context
  mutationId: string,         // TanStack Query mutation ID
  meta?: Record<string, unknown>,
}
```

### In onSuccess, onError, onSettled

```typescript
context: {
  ...contextFromUseContext,
  mutationId: string,
  meta?: Record<string, unknown>,
  onMutateResult: TOnMutateResult | undefined,  // Return value from onMutate
}
```

## Common Patterns

### Optimistic Updates

```typescript
const updateUser = client.mutation({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: userUpdateSchema,
  responseSchema: userSchema,
  processResponse: (data) => data,
  useContext: () => ({
    queryClient: useQueryClient(),
  }),
  onMutate: async (variables, context) => {
    // Cancel outgoing queries
    await context.queryClient.cancelQueries({
      queryKey: getUser.queryKey.filterKey({
        urlParams: { userId: variables.urlParams.userId },
      }),
    })

    // Snapshot previous value
    const previous = context.queryClient.getQueryData(
      getUser.queryKey.dataTag({
        urlParams: { userId: variables.urlParams.userId },
      })
    )

    // Optimistically update
    context.queryClient.setQueryData(
      getUser.queryKey.dataTag({
        urlParams: { userId: variables.urlParams.userId },
      }),
      { ...previous, ...variables.data }
    )

    return { previous }
  },
  onError: (error, variables, context) => {
    // Rollback on error
    if (context.onMutateResult?.previous) {
      context.queryClient.setQueryData(
        getUser.queryKey.dataTag({
          urlParams: { userId: variables.urlParams.userId },
        }),
        context.onMutateResult.previous
      )
    }
  },
})
```

### Toast Notifications

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: userCreateSchema,
  responseSchema: userSchema,
  processResponse: (data) => data,
  useContext: () => ({
    queryClient: useQueryClient(),
    toast: useToast(),
  }),
  onSuccess: (data, variables, context) => {
    context.toast.success('User created successfully!')
    context.queryClient.invalidateQueries({ queryKey: ['users'] })
  },
  onError: (error, variables, context) => {
    context.toast.error('Failed to create user')
  },
})
```

### Navigation

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: userCreateSchema,
  responseSchema: userSchema,
  processResponse: (data) => data,
  useContext: () => ({
    router: useRouter(),
    toast: useToast(),
  }),
  onSuccess: (data, variables, context) => {
    context.toast.success('User created!')
    context.router.push(`/users/${data.id}`)
  },
})
```

## Best Practices

### Always Provide QueryClient

```typescript
// ✅ Good - QueryClient available
const updateUser = client.mutation({
  // ...
  useContext: () => ({
    queryClient: useQueryClient(),
  }),
  onSuccess: (data, variables, context) => {
    context.queryClient.invalidateQueries({ queryKey: ['users'] })
  },
})
```

### Keep Context Minimal

```typescript
// ✅ Good - only what you need
useContext: () => ({
  queryClient: useQueryClient(),
  toast: useToast(),
})

// ❌ Bad - too much context
useContext: () => ({
  queryClient: useQueryClient(),
  toast: useToast(),
  router: useRouter(),
  analytics: useAnalytics(),
  // ... many more
})
```

### Type Your Context

```typescript
type MutationContext = {
  queryClient: QueryClient
  toast: Toast
}

const updateUser = client.mutation({
  // ...
  useContext: (): MutationContext => ({
    queryClient: useQueryClient(),
    toast: useToast(),
  }),
})
```

## Next Steps

- [Optimistic Updates](/docs/builder/react-query/guides/optimistic-updates) - Use context for optimistic updates
- [Mutations](/docs/builder/react-query/guides/mutations) - Basic mutations
- [Invalidation](/docs/builder/react-query/guides/invalidation) - Invalidate queries from mutations

