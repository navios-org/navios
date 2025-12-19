---
sidebar_position: 2
---

# Hooks

Navios DI React provides several hooks for accessing services in your React components.

## useService

Fetch a service with loading/error states. Automatically re-fetches when the service is invalidated.

```tsx
import { useService } from '@navios/di-react'

function UserProfile() {
  const { data, isLoading, isError, error, refetch } = useService(UserService)

  if (isLoading) return <div>Loading...</div>
  if (isError) return <div>Error: {error?.message}</div>

  return (
    <div>
      <h1>{data?.name}</h1>
      <button onClick={refetch}>Refresh</button>
    </div>
  )
}
```

### With Injection Tokens and Arguments

```tsx
import { useMemo } from 'react'
import { InjectionToken } from '@navios/di'
import { useService } from '@navios/di-react'
import { z } from 'zod'

const UserSchema = z.object({ userId: z.string() })
const UserToken = InjectionToken.create<
  { userId: string; name: string },
  typeof UserSchema
>('User', UserSchema)

function UserProfile({ userId }: { userId: string }) {
  // Important: Memoize args to avoid unnecessary re-fetches
  const args = useMemo(() => ({ userId }), [userId])
  const { data: user, isLoading } = useService(UserToken, args)

  if (isLoading) return <div>Loading...</div>

  return <div>{user?.name}</div>
}
```

## useSuspenseService

Use with React Suspense for a cleaner loading experience. Also subscribes to service invalidation.

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

### Error Boundaries

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

## useOptionalService

Load a service that may not be registered. Unlike `useService`, this hook does NOT throw an error if the service is not registered.

```tsx
import { useOptionalService } from '@navios/di-react'

function Analytics() {
  const {
    data: analytics,
    isNotFound,
    isLoading,
  } = useOptionalService(AnalyticsService)

  if (isLoading) return null
  if (isNotFound) {
    // Analytics service not configured, skip tracking
    return null
  }

  return <AnalyticsTracker service={analytics} />
}
```

## useInvalidate

Get a function to invalidate a service by its token. When called, this will destroy the current service instance and trigger re-fetch in all components using `useService`/`useSuspenseService` for that token.

```tsx
import { useService, useInvalidate } from '@navios/di-react'

function UserProfile() {
  const { data: user } = useService(UserService)
  const invalidateUser = useInvalidate(UserService)

  const handleRefresh = () => {
    invalidateUser() // All components using UserService will re-fetch
  }

  return (
    <div>
      <span>{user?.name}</span>
      <button onClick={handleRefresh}>Refresh</button>
    </div>
  )
}
```

### With Arguments

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

## useInvalidateInstance

Invalidate a service instance directly without knowing its token.

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

## useContainer

Access the container directly. Automatically returns the `ScopedContainer` if inside a `ScopeProvider`, otherwise returns the root `Container`.

```tsx
import { useContainer } from '@navios/di-react'

function MyComponent() {
  const container = useContainer()

  const handleClick = async () => {
    const service = await container.get(MyService)
    service.doSomething()
  }

  return <button onClick={handleClick}>Do Something</button>
}
```

## useRootContainer

Get the root container regardless of whether you're inside a `ScopeProvider`.

```tsx
import { useRootContainer } from '@navios/di-react'

function MyComponent() {
  const rootContainer = useRootContainer()

  const createNewScope = () => {
    const scopedContainer = rootContainer.beginRequest('new-scope')
    // Use scopedContainer...
  }

  return <button onClick={createNewScope}>Create Scope</button>
}
```

## Next Steps

- Learn about [providers](/docs/di/di-react/guides/providers) for container and scope management
- Explore [invalidation](/docs/di/di-react/guides/invalidation) for service invalidation patterns
- See [suspense](/docs/di/di-react/guides/suspense) for React Suspense integration

