---
sidebar_position: 3
---

# Real-Time Updates

This recipe demonstrates how to implement real-time updates using service invalidation.

## Automatic Refresh on Invalidation

```tsx
import { useService, useInvalidate } from '@navios/di-react'

function UserList() {
  const { data: users } = useService(UserService)
  const invalidateUsers = useInvalidate(UserService)

  useEffect(() => {
    // Set up real-time subscription
    const subscription = subscribeToUserUpdates(() => {
      invalidateUsers() // Refresh when updates occur
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [invalidateUsers])

  return (
    <div>
      {users?.map((user) => (
        <UserItem key={user.id} user={user} />
      ))}
    </div>
  )
}
```

## Polling Pattern

```tsx
import { useService, useInvalidate } from '@navios/di-react'

function UserList() {
  const { data: users } = useService(UserService)
  const invalidateUsers = useInvalidate(UserService)

  useEffect(() => {
    const interval = setInterval(() => {
      invalidateUsers() // Poll for updates
    }, 5000) // Poll every 5 seconds

    return () => clearInterval(interval)
  }, [invalidateUsers])

  return (
    <div>
      {users?.map((user) => (
        <UserItem key={user.id} user={user} />
      ))}
    </div>
  )
}
```

