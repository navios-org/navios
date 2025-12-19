---
sidebar_position: 3
---

# Mutations

Mutations are used to create, update, or delete data. Builder's React Query integration provides type-safe mutation hooks with automatic cache management.

## Basic Mutation

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
})

// Usage
function CreateUserForm() {
  const { mutate, isPending } = createUser()

  const handleSubmit = (formData: FormData) => {
    mutate({
      data: {
        name: formData.get('name') as string,
        email: formData.get('email') as string,
      },
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create User'}
      </button>
    </form>
  )
}
```

## Mutation from Endpoint

```typescript
// shared/endpoints/users.ts
export const createUserEndpoint = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  responseSchema: userSchema,
})
```

```typescript
// client/mutations/users.ts
const createUser = client.mutationFromEndpoint(createUserEndpoint, {
  processResponse: (data) => data,
})
```

## Mutation with URL Parameters

```typescript
const updateUser = client.mutation({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  responseSchema: userSchema,
  processResponse: (data) => data,
})

// Usage
function EditUserForm({ userId }: { userId: string }) {
  const { mutate, isPending } = updateUser()

  const handleSubmit = (formData: FormData) => {
    mutate({
      urlParams: { userId },
      data: {
        name: formData.get('name') as string,
        email: formData.get('email') as string,
      },
    })
  }

  return <form onSubmit={handleSubmit}>{/* ... */}</form>
}
```

## Mutation Callbacks

### onSuccess

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: userCreateSchema,
  responseSchema: userSchema,
  processResponse: (data) => data,
  onSuccess: (data, variables, context) => {
    console.log('User created:', data)
    // Invalidate queries, show toast, etc.
  },
})
```

### onError

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: userCreateSchema,
  responseSchema: userSchema,
  processResponse: (data) => data,
  onError: (error, variables, context) => {
    console.error('Failed to create user:', error)
    // Show error message, log to error tracking, etc.
  },
})
```

### onMutate

Called before the mutation executes (useful for optimistic updates):

```typescript
const updateUser = client.mutation({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: userUpdateSchema,
  responseSchema: userSchema,
  processResponse: (data) => data,
  onMutate: async (variables, context) => {
    // Cancel outgoing queries
    await queryClient.cancelQueries({ queryKey: ['users'] })

    // Snapshot previous value
    const previous = queryClient.getQueryData(['users', variables.urlParams.userId])

    // Optimistically update
    queryClient.setQueryData(
      ['users', variables.urlParams.userId],
      { ...previous, ...variables.data }
    )

    return { previous }
  },
})
```

### onSettled

Called after the mutation completes (success or error):

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: userCreateSchema,
  responseSchema: userSchema,
  processResponse: (data) => data,
  onSettled: (data, error, variables, context) => {
    // Always called, regardless of success or error
    console.log('Mutation completed')
  },
})
```

## Mutation States

```typescript
const {
  mutate,
  mutateAsync,
  isPending,      // Mutation is in progress
  isError,        // Mutation failed
  isSuccess,      // Mutation succeeded
  error,          // Error object
  data,           // Response data
  reset,          // Reset mutation state
} = createUser()
```

## Using mutate vs mutateAsync

### mutate

Fire and forget:

```typescript
const { mutate } = createUser()

mutate({
  data: { name: 'John', email: 'john@example.com' },
})
```

### mutateAsync

Returns a promise:

```typescript
const { mutateAsync } = createUser()

try {
  const user = await mutateAsync({
    data: { name: 'John', email: 'john@example.com' },
  })
  console.log('User created:', user)
} catch (error) {
  console.error('Failed:', error)
}
```

## Common Patterns

### Invalidate Queries After Mutation

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: userCreateSchema,
  responseSchema: userSchema,
  processResponse: (data) => data,
  useContext: () => ({ queryClient: useQueryClient() }),
  onSuccess: (data, variables, context) => {
    // Invalidate users list
    context.queryClient.invalidateQueries({ queryKey: ['users'] })
  },
})
```

### Update Cache After Mutation

```typescript
const updateUser = client.mutation({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: userUpdateSchema,
  responseSchema: userSchema,
  processResponse: (data) => data,
  useContext: () => ({ queryClient: useQueryClient() }),
  onSuccess: (data, variables, context) => {
    // Update specific query
    context.queryClient.setQueryData(
      getUser.queryKey.dataTag({ urlParams: { userId: data.id } }),
      data
    )
  },
})
```

### Optimistic Updates

See [Optimistic Updates](/docs/builder/react-query/guides/optimistic-updates) for detailed examples.

## Error Handling

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: userCreateSchema,
  responseSchema: userSchema,
  processResponse: (data) => data,
  onError: (error, variables, context) => {
    if (error instanceof NaviosError) {
      console.error('API Error:', error.message)
    } else {
      console.error('Unknown error:', error)
    }
  },
})

// In component
function CreateUserForm() {
  const { mutate, isError, error } = createUser()

  return (
    <form>
      {/* form fields */}
      {isError && (
        <div className="error">
          {error instanceof NaviosError ? error.message : 'An error occurred'}
        </div>
      )}
    </form>
  )
}
```

## Next Steps

- [Scoped Mutations](/docs/builder/react-query/guides/scoped-mutations) - Per-item mutation tracking
- [Optimistic Updates](/docs/builder/react-query/guides/optimistic-updates) - Update UI before server responds
- [Context in Mutations](/docs/builder/react-query/guides/mutation-context) - Access QueryClient and other context

