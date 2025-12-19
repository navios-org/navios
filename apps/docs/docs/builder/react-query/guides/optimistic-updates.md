---
sidebar_position: 10
---

# Optimistic Updates

Optimistic updates allow you to update the UI immediately before the server responds, providing a better user experience. If the mutation fails, you can rollback the changes.

## Basic Pattern

The optimistic update pattern involves:

1. **onMutate**: Cancel queries, snapshot previous value, optimistically update
2. **onError**: Rollback to previous value
3. **onSuccess**: Optionally refetch to ensure consistency

## Basic Example

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
    // 1. Cancel outgoing queries
    await context.queryClient.cancelQueries({
      queryKey: getUser.queryKey.filterKey({
        urlParams: { userId: variables.urlParams.userId },
      }),
    })

    // 2. Snapshot previous value
    const previous = context.queryClient.getQueryData(
      getUser.queryKey.dataTag({
        urlParams: { userId: variables.urlParams.userId },
      })
    )

    // 3. Optimistically update
    context.queryClient.setQueryData(
      getUser.queryKey.dataTag({
        urlParams: { userId: variables.urlParams.userId },
      }),
      { ...previous, ...variables.data }
    )

    // 4. Return context for rollback
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
  onSuccess: (data, variables, context) => {
    // Optionally refetch to ensure consistency
    context.queryClient.invalidateQueries({
      queryKey: getUser.queryKey.filterKey({
        urlParams: { userId: data.id },
      }),
    })
  },
})
```

## Updating Lists

Optimistically update items in a list:

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
    await context.queryClient.cancelQueries({
      queryKey: getUsers.queryKey.filterKey({}),
    })

    const previous = context.queryClient.getQueryData(
      getUsers.queryKey.dataTag({})
    )

    // Update item in list
    context.queryClient.setQueryData(
      getUsers.queryKey.dataTag({}),
      (old: { users: User[] } | undefined) => {
        if (!old) return old
        return {
          ...old,
          users: old.users.map((user) =>
            user.id === variables.urlParams.userId
              ? { ...user, ...variables.data }
              : user
          ),
        }
      }
    )

    return { previous }
  },
  onError: (error, variables, context) => {
    if (context.onMutateResult?.previous) {
      context.queryClient.setQueryData(
        getUsers.queryKey.dataTag({}),
        context.onMutateResult.previous
      )
    }
  },
})
```

## Adding to Lists

Optimistically add items to a list:

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: userCreateSchema,
  responseSchema: userSchema,
  processResponse: (data) => data,
  useContext: () => ({
    queryClient: useQueryClient(),
  }),
  onMutate: async (variables, context) => {
    await context.queryClient.cancelQueries({
      queryKey: getUsers.queryKey.filterKey({}),
    })

    const previous = context.queryClient.getQueryData(
      getUsers.queryKey.dataTag({})
    )

    // Optimistically add new user
    const optimisticUser = {
      id: 'temp-' + Date.now(),
      ...variables.data,
      createdAt: new Date().toISOString(),
    }

    context.queryClient.setQueryData(
      getUsers.queryKey.dataTag({}),
      (old: { users: User[] } | undefined) => {
        if (!old) return { users: [optimisticUser] }
        return {
          ...old,
          users: [optimisticUser, ...old.users],
        }
      }
    )

    return { previous, optimisticUser }
  },
  onError: (error, variables, context) => {
    if (context.onMutateResult?.previous) {
      context.queryClient.setQueryData(
        getUsers.queryKey.dataTag({}),
        context.onMutateResult.previous
      )
    }
  },
  onSuccess: (data, variables, context) => {
    // Replace optimistic user with real data
    context.queryClient.setQueryData(
      getUsers.queryKey.dataTag({}),
      (old: { users: User[] } | undefined) => {
        if (!old) return old
        return {
          ...old,
          users: old.users.map((user) =>
            user.id === context.onMutateResult?.optimisticUser.id
              ? data
              : user
          ),
        }
      }
    )
  },
})
```

## Removing from Lists

Optimistically remove items from a list:

```typescript
const deleteUser = client.mutation({
  method: 'DELETE',
  url: '/users/$userId',
  responseSchema: z.object({ success: z.boolean() }),
  processResponse: (data) => data,
  useContext: () => ({
    queryClient: useQueryClient(),
  }),
  onMutate: async (variables, context) => {
    await context.queryClient.cancelQueries({
      queryKey: getUsers.queryKey.filterKey({}),
    })

    const previous = context.queryClient.getQueryData(
      getUsers.queryKey.dataTag({})
    )

    // Optimistically remove user
    context.queryClient.setQueryData(
      getUsers.queryKey.dataTag({}),
      (old: { users: User[] } | undefined) => {
        if (!old) return old
        return {
          ...old,
          users: old.users.filter(
            (user) => user.id !== variables.urlParams.userId
          ),
        }
      }
    )

    return { previous }
  },
  onError: (error, variables, context) => {
    if (context.onMutateResult?.previous) {
      context.queryClient.setQueryData(
        getUsers.queryKey.dataTag({}),
        context.onMutateResult.previous
      )
    }
  },
})
```

## Best Practices

### Always Cancel Queries

```typescript
// ✅ Good - cancel queries first
onMutate: async (variables, context) => {
  await context.queryClient.cancelQueries({ queryKey: ['users'] })
  // ... rest of logic
}

// ❌ Bad - may cause race conditions
onMutate: async (variables, context) => {
  // Missing cancelQueries
  context.queryClient.setQueryData(/* ... */)
}
```

### Snapshot Previous Value

```typescript
// ✅ Good - save previous for rollback
onMutate: async (variables, context) => {
  const previous = context.queryClient.getQueryData(/* ... */)
  // ... update
  return { previous }
}

// ❌ Bad - can't rollback
onMutate: async (variables, context) => {
  context.queryClient.setQueryData(/* ... */)
  // No previous value saved
}
```

### Rollback on Error

```typescript
// ✅ Good - rollback on error
onError: (error, variables, context) => {
  if (context.onMutateResult?.previous) {
    context.queryClient.setQueryData(/* ... */, context.onMutateResult.previous)
  }
}

// ❌ Bad - no rollback
onError: (error, variables, context) => {
  // UI stays in optimistic state even on error
}
```

## Next Steps

- [Context in Mutations](/docs/builder/react-query/guides/mutation-context) - Access QueryClient
- [Mutations](/docs/builder/react-query/guides/mutations) - Basic mutations
- [Query Keys](/docs/builder/react-query/guides/query-keys) - Understand query keys

