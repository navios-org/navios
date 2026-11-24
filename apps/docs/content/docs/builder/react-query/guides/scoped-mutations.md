# Scoped Mutations

When the same mutation runs for many items — one "Save" button per row of a list — you usually want loading state per item rather than per mutation. Every mutation has a `mutationKey` and a `useIsMutating` hook for exactly that.

## Mutation Key

Every mutation created with `client.mutation` has a key shared by all mutations of its endpoint:

```typescript
const updateUser = client.mutation({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: z.object({ name: z.string() }),
  responseSchema: userSchema,
})

updateUser.mutationKey // ['PATCH', '/users/$userId']
```

With a `keyPrefix` / `keySuffix` the key is `[...keyPrefix, method, url, ...keySuffix]`.

## useIsMutating

`useIsMutating()` returns `true` while any mutation of the endpoint is in flight, in any component:

```typescript
function SaveIndicator() {
  const isSaving = updateUser.useIsMutating()
  return isSaving ? <span>Saving...</span> : null
}
```

Pass `urlParams` to count only the mutations running for those params:

```typescript
function UserRow({ user }: { user: User }) {
  const { mutate } = updateUser()
  const isSaving = updateUser.useIsMutating({ urlParams: { userId: user.id } })

  return (
    <li>
      {user.name}
      <button
        disabled={isSaving}
        onClick={() => mutate({ urlParams: { userId: user.id }, data: { name: 'New name' } })}
      >
        {isSaving ? 'Saving...' : 'Rename'}
      </button>
    </li>
  )
}
```

The match is on the variables of the running mutations, so it works wherever the mutation was started. Values are compared as strings: `{ userId: 1 }` and `{ userId: '1' }` match the same mutations. With several URL params you may pass only some of them:

```typescript
const updateComment = client.mutation({
  method: 'PATCH',
  url: '/posts/$postId/comments/$commentId',
  requestSchema: z.object({ text: z.string() }),
  responseSchema: commentSchema,
})

updateComment.useIsMutating({ urlParams: { postId } }) // any comment of this post
updateComment.useIsMutating({ urlParams: { postId, commentId } }) // this comment
```

## isPending vs useIsMutating

- `isPending` from `updateUser()` describes the mutations started through **that hook instance**. In a row component it is already per-row.
- `useIsMutating` describes **every** running mutation of the endpoint, wherever it was started. Use it when the trigger and the indicator live in different components, or when a mutation can outlive the component that started it.

```typescript
function UserRow({ user }: { user: User }) {
  const args = { urlParams: { userId: user.id } }
  const { mutate: rename } = updateUser()
  const { mutate: remove } = deleteUser()

  const isRenaming = updateUser.useIsMutating(args)
  const isRemoving = deleteUser.useIsMutating(args)
  const busy = isRenaming || isRemoving

  return (
    <li>
      {user.name}
      <button disabled={busy} onClick={() => rename({ ...args, data: { name: 'New name' } })}>
        {isRenaming ? 'Saving...' : 'Rename'}
      </button>
      <button disabled={busy} onClick={() => remove(args)}>
        {isRemoving ? 'Deleting...' : 'Delete'}
      </button>
    </li>
  )
}
```

## Running Mutations in Series

TanStack's `scope` option is passed through. Mutations with the same `scope.id` run one after another instead of in parallel:

```typescript
const reorderItems = client.mutation({
  method: 'POST',
  url: '/lists/$listId/reorder',
  requestSchema: z.object({ order: z.array(z.string()) }),
  response: 'void',
  scope: { id: 'reorder' },
})
```

## Next Steps

- [Mutations](/docs/builder/react-query/guides/mutations) - Basic mutations
- [Optimistic Updates](/docs/builder/react-query/guides/optimistic-updates) - Update UI before the server responds
- [Context in Mutations](/docs/builder/react-query/guides/mutation-context) - What callbacks receive
