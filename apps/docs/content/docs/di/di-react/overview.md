---
sidebar_position: 1
---

# @navios/di-react

React integration for the `@navios/di` dependency injection system. Provides React-specific providers, hooks, and contexts that enable seamless integration of dependency injection into React applications.

**Package:** `@navios/di-react`
**License:** MIT
**Peer Dependencies:** `@navios/di`, `react` (^18.0.0 || ^19.0.0)

## Installation

```bash
npm install @navios/di-react @navios/di
```

## Key Principles

- **Provider-Based** - Container and scope provided via React Context
- **Hooks-First** - All DI access through React hooks
- **Suspense Support** - First-class React Suspense integration
- **Automatic Invalidation** - Services re-fetch when invalidated
- **Request Scoping** - Isolate services per component tree

## Quick Start

```typescript
import { Container, Injectable } from '@navios/di'
import { ContainerProvider, useSuspenseService } from '@navios/di-react'
import { Suspense } from 'react'

// Define service
@Injectable()
class UserService {
  async getCurrentUser() {
    return { id: '1', name: 'John' }
  }
}

// Setup container
const container = new Container()

// App with provider
function App() {
  return (
    <ContainerProvider container={container}>
      <Suspense fallback={<div>Loading...</div>}>
        <UserProfile />
      </Suspense>
    </ContainerProvider>
  )
}

// Component using service
function UserProfile() {
  const userService = useSuspenseService(UserService)
  const [user, setUser] = useState(null)

  useEffect(() => {
    userService.getCurrentUser().then(setUser)
  }, [userService])

  return <div>{user?.name}</div>
}
```

## Providers

### ContainerProvider

Makes the DI container available to all child components:

```typescript
import { Container } from '@navios/di'
import { ContainerProvider } from '@navios/di-react'

const container = new Container()

function App() {
  return (
    <ContainerProvider container={container}>
      <YourApp />
    </ContainerProvider>
  )
}
```

### ScopeProvider

Creates isolated request scopes for dependency injection:

```typescript
import { ScopeProvider } from '@navios/di-react'

function UserDashboard({ userId }: { userId: string }) {
  return (
    <ScopeProvider scopeId={`user-${userId}`} metadata={{ userId }}>
      <UserProfile />
      <UserSettings />
    </ScopeProvider>
  )
}
```

## Hooks

### useService

Fetches a service with loading/error states:

```typescript
import { useService } from '@navios/di-react'

function UserProfile() {
  const { data, isLoading, isError, refetch } = useService(UserService)

  if (isLoading) return <div>Loading...</div>
  if (isError) return <div>Error</div>

  return <div>{data.name}</div>
}
```

### useSuspenseService

Fetches a service using React Suspense:

```typescript
import { useSuspenseService } from '@navios/di-react'

function UserProfile() {
  const userService = useSuspenseService(UserService)
  return <div>{userService.currentUser.name}</div>
}

// Wrap with Suspense
<Suspense fallback={<Loading />}>
  <UserProfile />
</Suspense>
```

### useOptionalService

Fetches a service without throwing if not registered:

```typescript
import { useOptionalService } from '@navios/di-react'

function Analytics() {
  const { data: analytics, isNotFound } = useOptionalService(AnalyticsService)

  if (isNotFound) return null

  return <AnalyticsTracker service={analytics} />
}
```

### useInvalidateInstance

Returns a function to invalidate a service instance:

```typescript
import { useService, useInvalidateInstance } from '@navios/di-react'

function UserProfile() {
  const { data: user } = useService(UserService)
  const invalidateInstance = useInvalidateInstance()

  const handleRefresh = async () => {
    if (user) {
      await invalidateInstance(user)
      // All components using UserService will re-fetch
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

### useContainer

Direct access to the DI container:

```typescript
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

## Service Invalidation

The hooks implement automatic invalidation:

```typescript
// In one component
const { data: user } = useService(UserService)
const invalidateInstance = useInvalidateInstance()

// Invalidate the instance
if (user) {
  await invalidateInstance(user)
}

// All components using UserService automatically re-fetch
const { data } = useService(UserService) // Gets fresh instance
```

## Best Practices

### Use Suspense for Cleaner Code

```typescript
// Recommended
function UserProfile() {
  const service = useSuspenseService(UserService)
  return <div>{service.data}</div>
}

<Suspense fallback={<Loading />}>
  <UserProfile />
</Suspense>
```

### Memoize Token Arguments

```typescript
// Good - stable reference
const args = useMemo(() => ({ userId }), [userId])
const { data } = useService(UserToken, args)

// Bad - creates new object every render
const { data } = useService(UserToken, { userId })
```

### Use ScopeProvider for Request-Scoped Services

```typescript
<ScopeProvider scopeId={`order-${orderId}`}>
  <OrderDetails />
  <OrderItems />
</ScopeProvider>
```

