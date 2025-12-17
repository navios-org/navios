# @navios/di-react Specification

## Overview

`@navios/di-react` is a React integration library for the `@navios/di` dependency injection system. It provides React-specific providers, hooks, and contexts that enable seamless integration of dependency injection into React applications, allowing components to easily access and manage injected services with automatic re-fetching and lifecycle management.

**Package:** `@navios/di-react`
**Version:** 0.1.1
**License:** MIT
**Peer Dependencies:** `@navios/di`, `react` (^18.0.0 || ^19.0.0)

---

## Core Concepts

### Architecture Overview

```
ContainerProvider (provides DI container)
└── ScopeProvider (optional, creates request scope)
    └── Components
        ├── useService() - fetch with loading states
        ├── useSuspenseService() - fetch with Suspense
        ├── useOptionalService() - fetch optional services
        └── useInvalidate() - invalidate services
```

### Key Principles

- **Provider-Based** - Container and scope provided via React Context
- **Hooks-First** - All DI access through React hooks
- **Suspense Support** - First-class React Suspense integration
- **Automatic Invalidation** - Services re-fetch when invalidated
- **Request Scoping** - Isolate services per component tree

---

## Providers

### ContainerProvider

Makes the DI container available to all child components.

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

**Props:**

| Property    | Type        | Required | Description              |
| ----------- | ----------- | -------- | ------------------------ |
| `container` | `Container` | Yes      | The DI container instance |
| `children`  | `ReactNode` | Yes      | Child components         |

---

### ScopeProvider

Creates isolated request scopes for dependency injection. Services with `scope: InjectableScope.Request` are instantiated once per ScopeProvider and shared among all nested components.

```typescript
import { ScopeProvider } from '@navios/di-react'

function UserDashboard({ userId }: { userId: string }) {
  return (
    <ScopeProvider
      scopeId={`user-${userId}`}
      metadata={{ userId }}
    >
      <UserProfile />
      <UserSettings />
    </ScopeProvider>
  )
}
```

**Props:**

| Property   | Type                      | Default | Description                           |
| ---------- | ------------------------- | ------- | ------------------------------------- |
| `scopeId`  | `string`                  | auto    | Unique scope ID (auto-generated if omitted) |
| `metadata` | `Record<string, unknown>` | -       | Optional metadata for the request context |
| `priority` | `number`                  | 100     | Service resolution priority           |
| `children` | `ReactNode`               | -       | Child components                      |

**Use Cases:**

- Table rows with isolated state
- Modal dialogs with their own service instances
- Multi-tenant scenarios
- Any case requiring isolated service instances

**Implementation Details:**

- Uses `useId()` to generate unique scope IDs if not provided
- Calls `container.beginRequest()` on mount
- Calls `container.endRequest()` on unmount
- Handles React StrictMode double-renders correctly

---

## Hooks

### useContainer

Provides direct access to the DI container.

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

**Signature:**

```typescript
function useContainer(): Container
```

**Behavior:**

- Retrieves the Container from ContainerContext
- Throws error if used outside ContainerProvider

---

### useService

Fetches a service with automatic loading/error states and invalidation subscription.

```typescript
import { useService } from '@navios/di-react'

function UserProfile() {
  const { data, isLoading, isError, error, refetch } = useService(UserService)

  if (isLoading) return <div>Loading...</div>
  if (isError) return <div>Error: {error?.message}</div>

  return (
    <div>
      <h1>{data.name}</h1>
      <button onClick={refetch}>Refresh</button>
    </div>
  )
}
```

**Signature:**

```typescript
function useService<T>(
  token: ClassType | InjectionToken<T>,
  args?: unknown
): UseServiceResult<T>
```

**Return Type:**

```typescript
interface UseServiceResult<T> {
  data: T | undefined
  error: Error | undefined
  isLoading: boolean
  isSuccess: boolean
  isError: boolean
  refetch: () => void
}
```

**With Injection Tokens and Constructor Args:**

When a service has a schema defined for constructor arguments, pass the args to `useService`:

```typescript
import { Injectable, InjectionToken } from '@navios/di'
import { z } from 'zod'

// Define token with schema for constructor args
const connectionSchema = z.object({
  host: z.string(),
  port: z.number(),
})

const CONNECTION_TOKEN = InjectionToken.create<DatabaseConnection, typeof connectionSchema>(
  'DatabaseConnection',
  connectionSchema
)

// Service registered with the token
@Injectable({ token: CONNECTION_TOKEN, schema: connectionSchema })
class DatabaseConnection {
  constructor(private config: z.infer<typeof connectionSchema>) {}

  async query(sql: string) {
    // Use this.config.host and this.config.port
  }
}

// Usage in React component
function DatabaseStatus() {
  const args = useMemo(() => ({ host: 'localhost', port: 5432 }), [])
  const { data: connection, isLoading } = useService(CONNECTION_TOKEN, args)

  if (isLoading) return <div>Connecting...</div>
  return <div>Connected to database</div>
}
```

**Key Features:**

- Automatically handles loading, success, and error states
- Subscribes to service invalidation events
- Re-fetches automatically when service is invalidated
- Works with request-scoped services (respects ScopeProvider)
- Type-safe with all token types

---

### useSuspenseService

Fetches a service using React Suspense for cleaner loading UI.

```typescript
import { Suspense } from 'react'
import { useSuspenseService } from '@navios/di-react'

function UserProfile() {
  const userService = useSuspenseService(UserService)
  return <div>{userService.currentUser.name}</div>
}

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UserProfile />
    </Suspense>
  )
}
```

**Signature:**

```typescript
function useSuspenseService<T>(
  token: ClassType | InjectionToken<T>,
  args?: unknown
): T
```

**Key Features:**

- Integrates with React Suspense
- Throws promise during loading (Suspense catches it)
- Throws error if resolution fails
- Subscribes to service invalidation events
- Uses global cache per container
- Supports all injection token types

---

### useOptionalService

Like `useService`, but doesn't throw if service is not registered.

```typescript
import { useOptionalService } from '@navios/di-react'

function Analytics() {
  const { data: analytics, isNotFound } = useOptionalService(AnalyticsService)

  if (isNotFound) {
    // Analytics service not configured, skip tracking
    return null
  }

  return <AnalyticsTracker service={analytics} />
}
```

**Signature:**

```typescript
function useOptionalService<T>(
  token: ClassType | InjectionToken<T>,
  args?: unknown
): UseOptionalServiceResult<T>
```

**Return Type:**

```typescript
interface UseOptionalServiceResult<T> {
  data: T | undefined
  error: Error | undefined
  isLoading: boolean
  isSuccess: boolean
  isNotFound: boolean  // True if service not registered
  isError: boolean
  refetch: () => void
}
```

**Use Cases:**

- Optional dependencies
- Feature flags
- Plugin systems
- Graceful degradation

---

### useInvalidate

Returns a function to invalidate a service by its token, triggering re-fetches in all components using that service.

```typescript
import { useInvalidate } from '@navios/di-react'

function UserProfile() {
  const { data: user } = useService(UserService)
  const invalidateUser = useInvalidate(UserService)

  const handleRefresh = async () => {
    await invalidateUser()
    // All components using UserService will re-fetch
  }

  return (
    <div>
      <span>{user?.name}</span>
      <button onClick={handleRefresh}>Refresh</button>
    </div>
  )
}
```

**Signature:**

```typescript
// Without args
function useInvalidate<T>(token: T): () => Promise<void>

// With args (for tokens with schemas)
function useInvalidate<T, S>(
  token: InjectionToken<T, S>,
  args: unknown
): () => Promise<void>
```

**With Token Arguments:**

```typescript
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

---

### useInvalidateInstance

Returns a function to invalidate a service instance directly (without knowing its token).

```typescript
import { useInvalidateInstance } from '@navios/di-react'

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

**Signature:**

```typescript
function useInvalidateInstance(): (instance: unknown) => Promise<void>
```

---

### useScope

Retrieves the current scope ID from ScopeContext.

```typescript
import { useScope } from '@navios/di-react'

function DebugInfo() {
  const scopeId = useScope()

  return <div>Current scope: {scopeId ?? 'none'}</div>
}
```

**Signature:**

```typescript
function useScope(): string | null
```

---

### useScopeOrThrow

Retrieves the current scope ID or throws if not inside a ScopeProvider.

```typescript
import { useScopeOrThrow } from '@navios/di-react'

function ScopedComponent() {
  const scopeId = useScopeOrThrow()
  // Component requires a scope to function
  return <div>Scope: {scopeId}</div>
}
```

**Signature:**

```typescript
function useScopeOrThrow(): string
```

---

## Service Invalidation System

Both `useService` and `useSuspenseService` implement automatic invalidation:

1. **Event Subscription:** Hooks subscribe to the DI container's event bus for invalidation events
2. **Automatic Re-fetch:** When a service is invalidated:
   - The cached instance is cleared
   - The service is automatically re-fetched
   - Components receive the new instance
3. **Real-time Updates:** Enables reactive updates across multiple components

```typescript
// In one component
const invalidateUser = useInvalidate(UserService)
await invalidateUser()

// All components using UserService automatically re-fetch
const { data } = useService(UserService)  // Gets fresh instance
```

---

## Complete Example

```typescript
// services/user.service.ts
import { Injectable, InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Request })
class UserService {
  private currentUserId: string | null = null

  setCurrentUser(userId: string) {
    this.currentUserId = userId
  }

  async getCurrentUser() {
    if (!this.currentUserId) return null
    return await fetch(`/api/users/${this.currentUserId}`).then(r => r.json())
  }
}

@Injectable()
class AuthService {
  async login(credentials: { email: string; password: string }) {
    const response = await fetch('/api/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    })
    return response.json()
  }
}
```

```typescript
// app.tsx
import { Container } from '@navios/di'
import { ContainerProvider, ScopeProvider } from '@navios/di-react'

const container = new Container()

function App() {
  return (
    <ContainerProvider container={container}>
      <Router>
        <Routes>
          <Route path="/dashboard/:userId" element={<UserDashboard />} />
        </Routes>
      </Router>
    </ContainerProvider>
  )
}

function UserDashboard() {
  const { userId } = useParams()

  return (
    <ScopeProvider scopeId={`user-${userId}`} metadata={{ userId }}>
      <UserProfile />
      <UserSettings />
    </ScopeProvider>
  )
}
```

```typescript
// components/user-profile.tsx
import { Suspense } from 'react'
import { useSuspenseService, useInvalidate } from '@navios/di-react'

function UserProfileContent() {
  const userService = useSuspenseService(UserService)
  const invalidateUser = useInvalidate(UserService)
  const [user, setUser] = useState(null)

  useEffect(() => {
    userService.getCurrentUser().then(setUser)
  }, [userService])

  const handleRefresh = async () => {
    await invalidateUser()
  }

  return (
    <div>
      <h1>{user?.name}</h1>
      <button onClick={handleRefresh}>Refresh</button>
    </div>
  )
}

function UserProfile() {
  return (
    <Suspense fallback={<div>Loading profile...</div>}>
      <UserProfileContent />
    </Suspense>
  )
}
```

```typescript
// components/login-form.tsx
import { useService, useContainer } from '@navios/di-react'

function LoginForm() {
  const { data: authService, isLoading } = useService(AuthService)
  const container = useContainer()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const formData = new FormData(e.target as HTMLFormElement)

    const result = await authService?.login({
      email: formData.get('email') as string,
      password: formData.get('password') as string,
    })

    if (result?.userId) {
      // Navigate to dashboard
      navigate(`/dashboard/${result.userId}`)
    }
  }

  if (isLoading) return <div>Loading...</div>

  return (
    <form onSubmit={handleSubmit}>
      <input name="email" type="email" />
      <input name="password" type="password" />
      <button type="submit">Login</button>
    </form>
  )
}
```

---

## Best Practices

### 1. Use Suspense for Cleaner Code

```typescript
// Recommended - cleaner component logic
function UserProfile() {
  const service = useSuspenseService(UserService)
  return <div>{service.data}</div>
}

// Wrap with Suspense boundary
<Suspense fallback={<Loading />}>
  <UserProfile />
</Suspense>
```

### 2. Memoize Token Arguments

```typescript
// Good - stable reference
const args = useMemo(() => ({ userId }), [userId])
const { data } = useService(UserToken, args)

// Bad - creates new object every render
const { data } = useService(UserToken, { userId })
```

### 3. Use ScopeProvider for Request-Scoped Services

```typescript
// Isolate request-scoped services per user/context
<ScopeProvider scopeId={`order-${orderId}`}>
  <OrderDetails />
  <OrderItems />
</ScopeProvider>
```

### 4. Use Optional Services for Feature Flags

```typescript
function AnalyticsWrapper({ children }) {
  const { data: analytics, isNotFound } = useOptionalService(AnalyticsService)

  useEffect(() => {
    if (!isNotFound) {
      analytics?.trackPageView()
    }
  }, [analytics, isNotFound])

  return children
}
```

### 5. Invalidate Services for Real-Time Updates

```typescript
// After mutation, invalidate related services
const invalidateOrders = useInvalidate(OrderService)

const handleOrderCreated = async () => {
  await createOrder(data)
  await invalidateOrders()  // All components using OrderService refresh
}
```

---

## API Reference Summary

### Providers

| Provider            | Purpose                                    |
| ------------------- | ------------------------------------------ |
| `ContainerProvider` | Provides DI container to component tree    |
| `ScopeProvider`     | Creates isolated request scope for services |

### Hooks

| Hook                   | Purpose                                          |
| ---------------------- | ------------------------------------------------ |
| `useContainer`         | Access the DI container directly                 |
| `useService`           | Fetch service with loading/error states          |
| `useSuspenseService`   | Fetch service using React Suspense               |
| `useOptionalService`   | Fetch optional service (doesn't throw if missing) |
| `useInvalidate`        | Get function to invalidate a service by token    |
| `useInvalidateInstance`| Get function to invalidate a service by instance |
| `useScope`             | Get current scope ID (or null)                   |
| `useScopeOrThrow`      | Get current scope ID (throws if not in scope)    |

### Contexts

| Context            | Purpose                       |
| ------------------ | ----------------------------- |
| `ContainerContext` | Stores the DI Container       |
| `ScopeContext`     | Stores the current scope ID   |
