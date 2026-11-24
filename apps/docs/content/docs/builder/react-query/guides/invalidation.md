# Invalidation

Invalidation marks cached data as stale and refetches the queries that are in use. Every query has an `invalidate` helper, and mutations can declare what they invalidate.

## The Three Scopes

`invalidate(queryClient, args?, filters?)` returns a promise that resolves when the refetches are done.

```typescript
const queryClient = useQueryClient()

// Whole endpoint: every user
await getUser.invalidate(queryClient)

// Partial args: every entry for this user, whatever the query params
await getUser.invalidate(queryClient, { urlParams: { userId } })

// Exact: only the entry for these arguments
await getUser.invalidate(queryClient, { urlParams: { userId } }, { exact: true })
```

Invalidating a whole endpoint never touches another endpoint: `listUsers.invalidate(queryClient)` on `/users` leaves the `/users/$userId` entries alone.

The third argument takes TanStack's invalidation filters (`exact`, `refetchType`, `predicate`, `stale`, ...):

```typescript
// Mark as stale without refetching now
await listUsers.invalidate(queryClient, undefined, { refetchType: 'none' })
```

:::note
A query and an infinite query declared on the same endpoint have separate cache entries, but the query's whole-endpoint scope is a prefix of the infinite entries: `query.invalidate(queryClient)` invalidates both. `infiniteQuery.invalidate(queryClient)` invalidates the infinite entries only.
:::

## After a Mutation

### invalidates

Declare the queries a mutation makes stale. They are invalidated after the mutation succeeds, and not when it fails:

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: createUserSchema,
  responseSchema: userSchema,
  // A query object: every entry of that endpoint
  invalidates: [listUsers],
})

const updateUser = client.mutation({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: updateUserSchema,
  responseSchema: userSchema,
  invalidates: [
    listUsers,
    // A function: the key it returns, computed from the result and the variables
    (_data, variables) => getUser.key({ urlParams: variables.urlParams }),
  ],
})
```

A function may return `undefined` to skip the invalidation:

```typescript
invalidates: [
  (data) => (data.teamId ? getTeam.key({ urlParams: { teamId: data.teamId } }) : undefined),
],
```

### In a Callback

For anything `invalidates` cannot express, use the `QueryClient` from the callback context:

```typescript
const deleteUser = client.mutation({
  method: 'DELETE',
  url: '/users/$userId',
  response: 'void',
  onSuccess: async (_data, variables, context) => {
    // Drop the deleted user's entries instead of refetching a 404
    context.client.removeQueries({ queryKey: getUser.key({ urlParams: variables.urlParams }) })
    await listUsers.invalidate(context.client)
  },
})
```

## Manual Invalidation

```typescript
function RefreshButton({ userId }: { userId: string }) {
  const queryClient = useQueryClient()

  return (
    <button onClick={() => getUser.invalidate(queryClient, { urlParams: { userId } })}>
      Refresh
    </button>
  )
}
```

### Several Endpoints

```typescript
await Promise.all([
  listUsers.invalidate(queryClient),
  getUser.invalidate(queryClient, { urlParams: { userId } }),
  getUserPosts.invalidate(queryClient, { urlParams: { userId } }),
])
```

### With the QueryClient Directly

`query.key(...)` gives the key for any `queryClient` method:

```typescript
await queryClient.invalidateQueries({ queryKey: getUser.key({ urlParams: { userId } }) })
await queryClient.refetchQueries({ queryKey: listUsers.key() })
```

## Updating Instead of Refetching

When the mutation's response already contains the new data, write it to the cache and skip the request:

```typescript
const updateUser = client.mutation({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: updateUserSchema,
  responseSchema: userSchema,
  invalidates: [listUsers],
  onSuccess: (user, variables, context) => {
    getUser.setData(context.client, { urlParams: variables.urlParams }, user)
  },
})
```

## Best Practices

- **Invalidate what the mutation changes.** A create invalidates lists; an update invalidates the item and the lists that show it; a delete removes the item's entries and invalidates lists.
- **Prefer `invalidates` to callbacks.** It keeps the relationship between a mutation and its queries next to the declaration.
- **Use `query.key(...)`.** Hand-written keys do not match the cache; see [Query Keys](/docs/builder/react-query/guides/query-keys).
- **Pick the narrowest scope that is correct.** Partial args cover "everything about this user" without refetching every user.

## Next Steps

- [Query Keys](/docs/builder/react-query/guides/query-keys) - How keys and scopes work
- [Mutations](/docs/builder/react-query/guides/mutations) - Mutation settings
- [Optimistic Updates](/docs/builder/react-query/guides/optimistic-updates) - Update UI before the server responds
