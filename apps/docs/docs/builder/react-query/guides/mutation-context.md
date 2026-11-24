---
sidebar_position: 9
---

# Context in Mutations

Mutation callbacks are declared outside React, next to the endpoint. The context object they receive gives them what they need at run time: the `QueryClient`, and the result of any hooks you ask for through `useContext`.

## What the Context Contains

Every callback receives a context as its last argument:

| Property         | Source                                      | Available in                         |
| ---------------- | ------------------------------------------- | ------------------------------------ |
| `client`         | TanStack — the `QueryClient`                | all callbacks                        |
| `meta`           | TanStack — the mutation's `meta`            | all callbacks                        |
| `mutationKey`    | TanStack — the mutation's key               | all callbacks                        |
| your own keys    | the return value of `useContext`            | all callbacks                        |
| `onMutateResult` | the return value of `onMutate`              | `onSuccess`, `onError`, `onSettled`  |

## Accessing the QueryClient

The `QueryClient` is always available as `context.client`:

```typescript
const updateUser = client.mutation({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: updateUserSchema,
  responseSchema: userSchema,
  onSuccess: (user, variables, context) => {
    getUser.setData(context.client, { urlParams: variables.urlParams }, user)
  },
})
```

## Custom Context

`useContext` is a hook. It is called inside the mutation hook on every render, and its return value is merged into the context of every callback. Use it for other hooks the callbacks need:

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: createUserSchema,
  responseSchema: userSchema,
  useContext: () => ({
    navigate: useNavigate(),
    toast: useToast(),
  }),
  onSuccess: (user, variables, context) => {
    context.toast.success(`Created ${user.name}`)
    context.navigate(`/users/${user.id}`)
  },
  onError: (error, variables, context) => {
    context.toast.error(error.message)
  },
})
```

The context type is inferred from `useContext`'s return value.

## Passing Data from onMutate

Whatever `onMutate` returns is available to the later callbacks as `context.onMutateResult`, and on the hook result as `context`:

```typescript
const updateUser = client.mutation({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: updateUserSchema,
  responseSchema: userSchema,
  onMutate: (variables, context) => {
    return { startedAt: Date.now() }
  },
  onSettled: (data, error, variables, context) => {
    if (context.onMutateResult) {
      console.log('Took', Date.now() - context.onMutateResult.startedAt, 'ms')
    }
  },
})

const { context } = updateUser() // { startedAt: number } | undefined
```

## Callback Signatures

```typescript
onMutate: (variables, context) => onMutateResult
onSuccess: (data, variables, context) => void
onError: (error, variables, context) => void
onSettled: (data, error, variables, context) => void
```

All four may be async. `error` is the endpoint's `EndpointError`.

## Common Patterns

### Toast Notifications

```typescript
const deleteUser = client.mutation({
  method: 'DELETE',
  url: '/users/$userId',
  response: 'void',
  useContext: () => ({ toast: useToast() }),
  invalidates: [listUsers],
  onSuccess: (_data, _variables, context) => {
    context.toast.success('User deleted')
  },
  onError: (error, _variables, context) => {
    context.toast.error(
      error.kind === 'network' ? 'You appear to be offline' : 'Could not delete the user',
    )
  },
})
```

### Navigation

```typescript
const createPost = client.mutation({
  method: 'POST',
  url: '/posts',
  requestSchema: createPostSchema,
  responseSchema: postSchema,
  useContext: () => ({ navigate: useNavigate() }),
  onSuccess: (post, _variables, context) => {
    context.navigate(`/posts/${post.id}`)
  },
})
```

### Meta

`meta` is a TanStack option; it is passed through and readable in the callbacks:

```typescript
const archivePost = client.mutation({
  method: 'POST',
  url: '/posts/$postId/archive',
  response: 'void',
  meta: { audit: 'post.archive' },
  onSuccess: (_data, variables, context) => {
    audit(context.meta?.audit, variables.urlParams)
  },
})
```

## Best Practices

- **Keep `useContext` small.** It runs on every render of every component that uses the mutation.
- **Do not put the `QueryClient` in `useContext`.** It is already there as `context.client`.
- **Prefer `invalidates` and `optimistic`** to hand-written cache code in callbacks.
- **Follow the Rules of Hooks in `useContext`:** call hooks unconditionally.

## Next Steps

- [Mutations](/docs/builder/react-query/guides/mutations) - Mutation settings
- [Optimistic Updates](/docs/builder/react-query/guides/optimistic-updates) - The `optimistic` setting
- [Invalidation](/docs/builder/react-query/guides/invalidation) - The `invalidates` setting
