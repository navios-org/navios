---
sidebar_position: 5
---

# Invalidation

Both `useService` and `useSuspenseService` automatically subscribe to service invalidation events. When a service is invalidated, the hooks will automatically re-fetch the service.

## Automatic Invalidation

When a service is invalidated (e.g., via `container.invalidate(service)` or `useInvalidate`), the hooks will automatically:

1. Clear the cached instance
2. Re-fetch the service
3. Update the component with the new instance

## Using useInvalidate

```tsx
import { useService, useInvalidate } from '@navios/di-react'

function UserList() {
  const { data: users } = useService(UserService)
  const invalidateUsers = useInvalidate(UserService)

  const handleCreateUser = async () => {
    await createUser(newUser)
    invalidateUsers() // Automatically refreshes all components using UserService
  }

  return (
    <div>
      {users?.map((user) => (
        <UserItem key={user.id} user={user} />
      ))}
      <button onClick={handleCreateUser}>Add User</button>
    </div>
  )
}
```

## With Arguments

When using injection tokens with arguments, make sure to use the same arguments when invalidating:

```tsx
import { useMemo } from 'react'
import { useService, useInvalidate } from '@navios/di-react'

function UserProfile({ userId }: { userId: string }) {
  const args = useMemo(() => ({ userId }), [userId])
  const { data: user } = useService(UserToken, args)
  const invalidateUser = useInvalidate(UserToken, args)

  return (
    <div>
      <span>{user?.name}</span>
      <button onClick={() => invalidateUser()}>Refresh</button>
    </div>
  )
}
```

## Using useInvalidateInstance

Invalidate a service instance directly:

```tsx
import { useService, useInvalidateInstance } from '@navios/di-react'

function UserProfile() {
  const { data: user } = useService(UserService)
  const invalidateInstance = useInvalidateInstance()

  const handleRefresh = () => {
    if (user) {
      invalidateInstance(user)
    }
  }

  return (
    <div>
      <span>{user?.name}</span>
      <button onClick={handleRefresh}>Refresh</button>
    </div>
  )
}
```

## Real-World Example

```tsx
function UserList() {
  const { data: users } = useService(UserService)
  const invalidateUsers = useInvalidate(UserService)

  const handleDeleteUser = async (userId: string) => {
    await deleteUser(userId)
    invalidateUsers() // All components using UserService will re-fetch
  }

  const handleUpdateUser = async (userId: string, updates: any) => {
    await updateUser(userId, updates)
    invalidateUsers() // Refresh the list
  }

  return (
    <div>
      {users?.map((user) => (
        <UserItem
          key={user.id}
          user={user}
          onDelete={handleDeleteUser}
          onUpdate={handleUpdateUser}
        />
      ))}
    </div>
  )
}
```

## Best Practices

### 1. Invalidate After Mutations

```tsx
// ✅ Good: Invalidate after mutations
const handleCreate = async () => {
  await createItem(data)
  invalidateItems() // Refresh the list
}
```

### 2. Use Same Args for Invalidation

```tsx
// ✅ Good: Same args for service and invalidation
const args = useMemo(() => ({ userId }), [userId])
const { data } = useService(UserToken, args)
const invalidate = useInvalidate(UserToken, args)
```

## Next Steps

- Learn about [suspense](/docs/di/di-react/guides/suspense) for React Suspense integration
- Explore [hooks](/docs/di/di-react/guides/hooks) for all available hooks
- See [recipes](/docs/di/di-react/recipes/realtime-updates) for real-world examples

