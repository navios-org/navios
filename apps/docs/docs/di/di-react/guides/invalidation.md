---
sidebar_position: 5
---

# Invalidation

Both `useService` and `useSuspenseService` automatically subscribe to service invalidation events. When a service is invalidated, the hooks will automatically re-fetch the service.

## Automatic Invalidation

When a service is invalidated (e.g., via `container.invalidate(service)` or `useInvalidateInstance`), the hooks will automatically:

1. Clear the cached instance
2. Re-fetch the service
3. Update the component with the new instance

## Using useInvalidateInstance

The `useInvalidateInstance` hook returns a function that invalidates a service by its instance reference:

```tsx
import { useService, useInvalidateInstance } from '@navios/di-react'

function UserProfile() {
  const { data: user } = useService(UserService)
  const invalidateInstance = useInvalidateInstance()

  const handleRefresh = () => {
    if (user) {
      invalidateInstance(user) // Triggers re-fetch in all components using this service
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

## Using Container Directly

You can also invalidate services directly via the container:

```tsx
import { useContainer, useService } from '@navios/di-react'

function UserProfile() {
  const container = useContainer()
  const { data: user } = useService(UserService)

  const handleRefresh = async () => {
    if (user) {
      await container.invalidate(user)
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
  const invalidateInstance = useInvalidateInstance()

  const handleDeleteUser = async (userId: string) => {
    await deleteUser(userId)
    if (users) {
      invalidateInstance(users) // All components using UserService will re-fetch
    }
  }

  const handleUpdateUser = async (userId: string, updates: any) => {
    await updateUser(userId, updates)
    if (users) {
      invalidateInstance(users) // Refresh the list
    }
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
const { data: items } = useService(ItemService)
const invalidateInstance = useInvalidateInstance()

const handleCreate = async () => {
  await createItem(data)
  if (items) {
    invalidateInstance(items) // Refresh the list
  }
}
```

### 2. Check for Instance Before Invalidating

```tsx
// ✅ Good: Check that instance exists
const handleRefresh = () => {
  if (user) {
    invalidateInstance(user)
  }
}
```

### 3. Use refetch for Simple Cases

If you just need to refresh a single component, you can use the `refetch` function from `useService`:

```tsx
const { data: user, refetch } = useService(UserService)

const handleRefresh = () => {
  refetch() // Only refreshes this component
}
```

## Next Steps

- Learn about [suspense](/docs/di/di-react/guides/suspense) for React Suspense integration
- Explore [hooks](/docs/di/di-react/guides/hooks) for all available hooks
- See [recipes](/docs/di/di-react/recipes/realtime-updates) for real-world examples

