---
sidebar_position: 3
---

# Real-Time Updates

This recipe demonstrates how to implement real-time updates using service invalidation.

## Automatic Refresh on Invalidation

```tsx
import { useService } from '@navios/di-react'

function UserList() {
  const { data: users, refetch } = useService(UserService)

  useEffect(() => {
    // Set up real-time subscription
    const subscription = subscribeToUserUpdates(() => {
      refetch() // Refresh when updates occur
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [refetch])

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
import { useService } from '@navios/di-react'

function UserList() {
  const { data: users, refetch } = useService(UserService)

  useEffect(() => {
    const interval = setInterval(() => {
      refetch() // Poll for updates
    }, 5000) // Poll every 5 seconds

    return () => clearInterval(interval)
  }, [refetch])

  return (
    <div>
      {users?.map((user) => (
        <UserItem key={user.id} user={user} />
      ))}
    </div>
  )
}
```

