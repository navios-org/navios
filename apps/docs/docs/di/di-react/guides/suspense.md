---
sidebar_position: 6
---

# Suspense

Navios DI React provides first-class support for React Suspense through the `useSuspenseService` hook.

## Basic Usage

```tsx
import { Suspense } from 'react'
import { useSuspenseService } from '@navios/di-react'

function UserProfile() {
  const userService = useSuspenseService(UserService)
  const [user, setUser] = useState(null)

  useEffect(() => {
    userService.getCurrentUser().then(setUser)
  }, [userService])

  return <div>{user?.name}</div>
}

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UserProfile />
    </Suspense>
  )
}
```

## Error Boundaries

When using `useSuspenseService`, errors are thrown to the nearest error boundary:

```tsx
import { ErrorBoundary } from 'react-error-boundary'
import { Suspense } from 'react'
import { useSuspenseService } from '@navios/di-react'

function ErrorFallback({ error }) {
  return <div>Error: {error.message}</div>
}

function App() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Suspense fallback={<div>Loading...</div>}>
        <UserProfile />
      </Suspense>
    </ErrorBoundary>
  )
}
```

## With Injection Tokens

```tsx
import { useMemo } from 'react'
import { InjectionToken } from '@navios/di'
import { useSuspenseService } from '@navios/di-react'
import { z } from 'zod'

const UserSchema = z.object({ userId: z.string() })
const UserToken = InjectionToken.create<
  { userId: string; name: string },
  typeof UserSchema
>('User', UserSchema)

function UserProfile({ userId }: { userId: string }) {
  const args = useMemo(() => ({ userId }), [userId])
  const user = useSuspenseService(UserToken, args)

  return <div>{user?.name}</div>
}
```

## Automatic Invalidation

`useSuspenseService` automatically subscribes to service invalidation events:

```tsx
function UserProfile() {
  const user = useSuspenseService(UserService)
  const invalidateUser = useInvalidate(UserService)

  const handleRefresh = () => {
    invalidateUser() // Component will re-render with fresh data
  }

  return (
    <div>
      <span>{user?.name}</span>
      <button onClick={handleRefresh}>Refresh</button>
    </div>
  )
}
```

## Best Practices

### 1. Always Use Error Boundaries

```tsx
// ✅ Good: Error boundary with Suspense
<ErrorBoundary FallbackComponent={ErrorFallback}>
  <Suspense fallback={<Loading />}>
    <Component />
  </Suspense>
</ErrorBoundary>
```

### 2. Memoize Arguments

```tsx
// ✅ Good: Memoized args
const args = useMemo(() => ({ userId }), [userId])
const user = useSuspenseService(UserToken, args)

// ❌ Bad: New object on every render
const user = useSuspenseService(UserToken, { userId })
```

## Next Steps

- Learn about [error handling](/docs/di/di-react/guides/error-handling) for error management
- Explore [hooks](/docs/di/di-react/guides/hooks) for all available hooks
- See [recipes](/docs/di/di-react/recipes/data-fetching) for real-world examples

