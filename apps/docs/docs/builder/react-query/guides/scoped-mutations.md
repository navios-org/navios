---
sidebar_position: 4
---

# Scoped Mutations

Scoped mutations allow you to track mutation state per item using URL parameters. This is useful when you have multiple instances of the same mutation (e.g., updating different users in a list).

## Basic Scoped Mutation

Enable `useKey` to scope mutations by URL parameters:

```typescript
const updateUser = client.mutation({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: userUpdateSchema,
  responseSchema: userSchema,
  useKey: true, // Enable scoping
  processResponse: (data) => data,
})
```

## Usage

When `useKey` is enabled, you must pass URL params to the hook:

```typescript
function UserCard({ userId }: { userId: string }) {
  // Must pass urlParams to hook
  const { mutate, isPending } = updateUser({ urlParams: { userId } })

  // Check if THIS specific user is being updated
  const isUpdating = updateUser.useIsMutating({ userId })

  return (
    <div>
      <button
        onClick={() => mutate({ data: { name: 'New Name' } })}
        disabled={isPending || isUpdating}
      >
        {isUpdating ? 'Saving...' : 'Update'}
      </button>
    </div>
  )
}
```

## useIsMutating Hook

Check if a specific mutation is in progress:

```typescript
function UserList() {
  const { data: users } = getUsers.use({})

  return (
    <div>
      {users.map((user) => (
        <UserCard key={user.id} userId={user.id} />
      ))}
    </div>
  )
}

function UserCard({ userId }: { userId: string }) {
  const { mutate } = updateUser({ urlParams: { userId } })
  const isUpdating = updateUser.useIsMutating({ userId })

  return (
    <div>
      {isUpdating && <span>Saving...</span>}
      <button onClick={() => mutate({ data: { name: 'New' } })}>
        Update
      </button>
    </div>
  )
}
```

## Multiple Scoped Mutations

You can have multiple scoped mutations in the same component:

```typescript
function UserCard({ userId }: { userId: string }) {
  const { mutate: updateUser } = updateUserMutation({ urlParams: { userId } })
  const { mutate: deleteUser } = deleteUserMutation({ urlParams: { userId } })

  const isUpdating = updateUserMutation.useIsMutating({ userId })
  const isDeleting = deleteUserMutation.useIsMutating({ userId })

  return (
    <div>
      <button
        onClick={() => updateUser({ data: { name: 'New' } })}
        disabled={isUpdating || isDeleting}
      >
        {isUpdating ? 'Saving...' : 'Update'}
      </button>
      <button
        onClick={() => deleteUser({})}
        disabled={isUpdating || isDeleting}
      >
        {isDeleting ? 'Deleting...' : 'Delete'}
      </button>
    </div>
  )
}
```

## Without useKey

If `useKey` is not enabled, mutations are global:

```typescript
const updateUser = client.mutation({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: userUpdateSchema,
  responseSchema: userSchema,
  // useKey: false (default)
  processResponse: (data) => data,
})

function UserCard({ userId }: { userId: string }) {
  const { mutate, isPending } = updateUser()
  // isPending is true if ANY user is being updated

  return (
    <button
      onClick={() => mutate({ urlParams: { userId }, data: { name: 'New' } })}
      disabled={isPending}
    >
      {isPending ? 'Saving...' : 'Update'}
    </button>
  )
}
```

## When to Use

### Use Scoped Mutations When:

- You have multiple instances of the same mutation (e.g., list items)
- You need to show per-item loading states
- You want to track which specific item is being mutated

### Use Global Mutations When:

- You have a single mutation instance (e.g., create form)
- You don't need per-item tracking
- Simpler API is preferred

## Common Patterns

### List with Per-Item Actions

```typescript
function UserList() {
  const { data: users } = getUsers.use({})

  return (
    <div>
      {users.map((user) => (
        <UserListItem key={user.id} user={user} />
      ))}
    </div>
  )
}

function UserListItem({ user }: { user: User }) {
  const { mutate: updateUser, isPending } = updateUserMutation({
    urlParams: { userId: user.id },
  })
  const isUpdating = updateUserMutation.useIsMutating({ userId: user.id })

  return (
    <div>
      <span>{user.name}</span>
      {isUpdating && <span> (Saving...)</span>}
      <button
        onClick={() => updateUser({ data: { name: 'Updated' } })}
        disabled={isPending || isUpdating}
      >
        Update
      </button>
    </div>
  )
}
```

### Bulk Actions with Individual Tracking

```typescript
function UserList() {
  const { data: users } = getUsers.use({})

  return (
    <div>
      {users.map((user) => (
        <UserCheckbox key={user.id} user={user} />
      ))}
    </div>
  )
}

function UserCheckbox({ user }: { user: User }) {
  const { mutate: toggleUser } = toggleUserMutation({
    urlParams: { userId: user.id },
  })
  const isToggling = toggleUserMutation.useIsMutating({ userId: user.id })

  return (
    <label>
      <input
        type="checkbox"
        checked={user.active}
        onChange={() => toggleUser({ data: { active: !user.active } })}
        disabled={isToggling}
      />
      {user.name}
      {isToggling && <span> (Updating...)</span>}
    </label>
  )
}
```

## Next Steps

- [Mutations](/docs/builder/react-query/guides/mutations) - Basic mutations
- [Optimistic Updates](/docs/builder/react-query/guides/optimistic-updates) - Update UI before server responds
- [Context in Mutations](/docs/builder/react-query/guides/mutation-context) - Access QueryClient

