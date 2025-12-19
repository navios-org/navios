---
sidebar_position: 2
---

# Data Fetching

This recipe shows different patterns for data fetching with Navios DI React.

## Using useService

```tsx
import { useService } from '@navios/di-react'

function UserList() {
  const { data: users, isLoading, isError, refetch } = useService(UserService)

  if (isLoading) return <div>Loading...</div>
  if (isError) return <div>Error loading users</div>

  return (
    <div>
      {users?.map((user) => (
        <UserItem key={user.id} user={user} />
      ))}
      <button onClick={refetch}>Refresh</button>
    </div>
  )
}
```

## Using useSuspenseService

```tsx
import { Suspense } from 'react'
import { useSuspenseService } from '@navios/di-react'

function UserList() {
  const userService = useSuspenseService(UserService)
  const [users, setUsers] = useState([])

  useEffect(() => {
    userService.getUsers().then(setUsers)
  }, [userService])

  return (
    <div>
      {users.map((user) => (
        <UserItem key={user.id} user={user} />
      ))}
    </div>
  )
}

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UserList />
    </Suspense>
  )
}
```

## With Invalidation

```tsx
import { useService, useInvalidate } from '@navios/di-react'

function UserList() {
  const { data: users } = useService(UserService)
  const invalidateUsers = useInvalidate(UserService)

  const handleCreateUser = async (userData: any) => {
    await createUser(userData)
    invalidateUsers() // Automatically refreshes the list
  }

  return (
    <div>
      {users?.map((user) => (
        <UserItem key={user.id} user={user} />
      ))}
      <button onClick={() => handleCreateUser({ name: 'New User' })}>
        Add User
      </button>
    </div>
  )
}
```

