# @navios/di-react

React integration for `@navios/di` dependency injection container. Provides a set of hooks and providers to seamlessly use dependency injection in React applications with automatic service lifecycle management, invalidation subscriptions, and request-scoped service isolation.

## Features

- **🎯 Type-Safe**: Full TypeScript support with compile-time type checking
- **🎨 Flexible API**: Support for classes, injection tokens, and factory tokens
- **⚙️ Schema-Validated Arguments**: Type-safe arguments for tokens with any [Standard Schema](https://standardschema.dev) (Zod, Valibot, ArkType, ...)
- **🔄 Automatic Invalidation**: Services automatically re-fetch when invalidated
- **⚡ React Suspense Support**: Use `useSuspenseService` with React Suspense for declarative loading
- **🔌 Request Scopes**: Isolate services per request/component tree with `ScopeProvider`
- **📦 Optional Services**: Load services that may not be registered with `useOptionalService`
- **🚀 Performance**: Synchronous resolution when instances are already cached

## Installation

```bash
npm install @navios/di-react @navios/di react
# or
yarn add @navios/di-react @navios/di react
# or
pnpm add @navios/di-react @navios/di react
```

## Quick Start

### 1. Set up the Container Provider

Wrap your application with `ContainerProvider`:

```tsx
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

### 2. Use Services in Components

```tsx
import { useService } from '@navios/di-react'

import { MyService } from './services/my-service'

function MyComponent() {
  const { data, error } = useService(MyService)

  if (error) return <div>Error: {error.message}</div>
  if (!data) return <div>Loading...</div>

  return <div>{data.someValue}</div>
}
```

`data` is `MyService | undefined`: it is `undefined` until the instance is ready, so check it before use.

## Core Concepts

### Container Provider

The `ContainerProvider` makes the DI container available to all child components via React context. You should wrap your application root with it.

```tsx
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

**Note**: The container prop should be stable. Avoid creating a new container on every render. If you need to create the container dynamically, use `useMemo` or `useState`.

### Scope Provider

`ScopeProvider` creates an isolated request scope for dependency injection. Services with `scope: 'Request'` will be instantiated once per scope and shared among all components within that provider.

This is useful for:

- **Table rows** that need isolated state
- **Modal dialogs** with their own service instances
- **Multi-tenant scenarios**
- **Any case where you need isolated service instances**

```tsx
import { ScopeProvider } from '@navios/di-react'

function Table({ rows }) {
  return (
    <table>
      {rows.map((row) => (
        <ScopeProvider key={row.id} scopeId={row.id} metadata={{ rowData: row }}>
          <TableRow />
        </ScopeProvider>
      ))}
    </table>
  )
}
```

The metadata key `scopeId` is reserved: it always holds the scope ID, so a `scopeId` entry in `metadata` is overwritten.

## Hooks

### useContainer

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

### useRootContainer

Get the root container regardless of whether you're inside a `ScopeProvider`. Useful when you need to create new request scopes programmatically.

```tsx
import { useRootContainer } from '@navios/di-react'

function MyComponent() {
  const rootContainer = useRootContainer()

  const createNewScope = () => {
    const scopedContainer = rootContainer.createScope({ scopeId: 'new-scope' })
    // Use scopedContainer...
  }

  return <button onClick={createNewScope}>Create Scope</button>
}
```

### useService

Fetch a service with loading/error states. Automatically re-fetches when the service is invalidated.

```tsx
import { useService } from '@navios/di-react'

import { MyService } from './services/my-service'

function MyComponent() {
  const { data, error, refetch } = useService(MyService)

  if (error) return <div>Error: {error.message}</div>
  if (!data) return <div>Loading...</div>

  return (
    <div>
      <p>{data.someValue}</p>
      <button onClick={refetch}>Refresh</button>
    </div>
  )
}
```

#### With Injection Tokens and Arguments

```tsx
import { InjectionToken } from '@navios/di'
import { useService } from '@navios/di-react'
import { z } from 'zod'

const UserSchema = z.object({ userId: z.string() })
const UserToken = InjectionToken.create<{ userId: string; name: string }, typeof UserSchema>(
  'User',
  UserSchema,
)

function UserProfile({ userId }: { userId: string }) {
  const { data: user } = useService(UserToken, { userId })

  if (!user) return <div>Loading...</div>

  return <div>{user.name}</div>
}
```

The token's schema can be any Standard Schema, not only Zod. The arguments are typed as `InferInput<S>`, the input type of that schema.

Arguments are compared by their JSON form, so an object written inline does not need `useMemo`: the hook resolves again only when the serialized value changes.

### useSuspenseService

Use with React Suspense for a cleaner loading experience. Also subscribes to service invalidation.

```tsx
import { useSuspenseService } from '@navios/di-react'
import { Suspense } from 'react'

import { MyService } from './services/my-service'

function MyComponent() {
  const service = useSuspenseService(MyService)

  return <div>{service.someValue}</div>
}

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <MyComponent />
    </Suspense>
  )
}
```

#### Error Boundaries

When using `useSuspenseService`, errors are thrown to the nearest error boundary. Make sure to wrap your components with an error boundary:

```tsx
import { useSuspenseService } from '@navios/di-react'
import { Suspense } from 'react'
import { ErrorBoundary } from 'react-error-boundary'

function ErrorFallback({ error }) {
  return <div>Error: {error.message}</div>
}

function App() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Suspense fallback={<div>Loading...</div>}>
        <MyComponent />
      </Suspense>
    </ErrorBoundary>
  )
}
```

### useOptionalService

Load a service that may not be registered. Unlike `useService`, this hook does NOT throw an error if the service is not registered. Instead, it returns `isNotFound: true`.

This is useful for:

- **Optional dependencies** that may or may not be configured
- **Feature flags** where a service might not be available
- **Plugins or extensions** that are conditionally registered

```tsx
import { useOptionalService } from '@navios/di-react'

function Analytics() {
  const { data: analytics, isNotFound } = useOptionalService(AnalyticsService)

  if (isNotFound) {
    // Analytics service not configured, skip tracking
    return null
  }
  if (!analytics) return null // still loading

  return <AnalyticsTracker service={analytics} />
}
```

### useInvalidateInstance

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

### useScope

Get the current scope ID. Returns `null` if not inside a `ScopeProvider`.

```tsx
import { useScope } from '@navios/di-react'

function MyComponent() {
  const scopeId = useScope()

  if (!scopeId) {
    return <div>Not in a scope</div>
  }

  return <div>Current scope: {scopeId}</div>
}
```

### useScopeOrThrow

Get the current scope ID, throwing an error if not inside a `ScopeProvider`.

```tsx
import { useScopeOrThrow } from '@navios/di-react'

function MyComponent() {
  const scopeId = useScopeOrThrow() // Throws if not in ScopeProvider

  return <div>Current scope: {scopeId}</div>
}
```

### useScopedContainer

Get the current `ScopedContainer`. Returns `null` if not inside a `ScopeProvider`.

```tsx
import { useScopedContainer } from '@navios/di-react'

function TableRow() {
  const scope = useScopedContainer()
  const rowData = scope?.getMetadata('rowData')

  return <tr>{/* ... */}</tr>
}
```

### useScopedContainerOrThrow

Get the current `ScopedContainer`, throwing an error if not inside a `ScopeProvider`.

```tsx
import { useScopedContainerOrThrow } from '@navios/di-react'

function TableRow() {
  const scope = useScopedContainerOrThrow()
  const rowData = scope.getMetadata('rowData')

  return <tr>{/* ... */}</tr>
}
```

### useScopeMetadata

Get metadata from the current scope. Returns `undefined` if not inside a `ScopeProvider` or if the key doesn't exist.

```tsx
import { useScopeMetadata } from '@navios/di-react'

// In parent component:
;<ScopeProvider metadata={{ userId: '123', theme: 'dark' }}>
  <ChildComponent />
</ScopeProvider>

// In child component:
function ChildComponent() {
  const userId = useScopeMetadata<string>('userId')
  const theme = useScopeMetadata<'light' | 'dark'>('theme')

  return (
    <div>
      User: {userId}, Theme: {theme}
    </div>
  )
}
```

## Service Invalidation

Both `useService` and `useSuspenseService` automatically subscribe to service invalidation events via the DI container's event bus. When a service is invalidated (e.g., via `container.invalidate(service)` or `useInvalidateInstance`), the hooks will automatically:

1. Clear the cached instance
2. Re-fetch the service
3. Update the component with the new instance

This enables reactive updates when services change, making it easy to implement features like:

- **Cache invalidation** after mutations
- **Real-time updates** when data changes
- **Refresh on user action** (e.g., pull-to-refresh)

```tsx
function UserList() {
  const { data: users } = useService(UserService)
  const invalidateInstance = useInvalidateInstance()

  const handleCreateUser = async () => {
    await createUser(newUser)
    if (users) {
      invalidateInstance(users) // Automatically refreshes all components using UserService
    }
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

## Best Practices

### 1. Pass Arguments as Plain Data

Hooks compare arguments by their JSON form, so inline objects are fine and `useMemo` is not needed:

```tsx
const { data } = useService(UserToken, { userId })
```

Keep the arguments to plain, JSON-serializable data. Two values that serialize the same (for example two different functions or class instances) are treated as unchanged.

### 2. Use Error Boundaries with Suspense

When using `useSuspenseService`, always wrap with an error boundary:

```tsx
<ErrorBoundary FallbackComponent={ErrorFallback}>
  <Suspense fallback={<Loading />}>
    <Component />
  </Suspense>
</ErrorBoundary>
```

### 3. Scope Isolation

Use `ScopeProvider` when you need isolated service instances:

```tsx
// Each row gets its own service instance
{
  rows.map((row) => (
    <ScopeProvider key={row.id} scopeId={row.id}>
      <TableRow />
    </ScopeProvider>
  ))
}
```

### 4. Optional Services for Feature Flags

Use `useOptionalService` for conditionally available services:

```tsx
function FeatureComponent() {
  const { data: feature, isNotFound } = useOptionalService(FeatureService)

  if (isNotFound) return null // Feature not enabled

  return <FeatureUI service={feature} />
}
```

## API Reference

### ContainerProvider

| Prop        | Type        | Description                                  |
| ----------- | ----------- | -------------------------------------------- |
| `container` | `Container` | The DI container instance (should be stable) |
| `children`  | `ReactNode` | Child components                             |

### ScopeProvider

| Prop       | Type                       | Description                                                                | Default     |
| ---------- | -------------------------- | -------------------------------------------------------------------------- | ----------- |
| `scopeId`  | `string?`                  | Optional explicit scope ID. If not provided, a unique ID will be generated | `undefined` |
| `metadata` | `Record<string, unknown>?` | Optional metadata to attach to the scope. The key `scopeId` is reserved    | `undefined` |
| `children` | `ReactNode`                | Child components                                                           | -           |

### useContainer

```ts
function useContainer(): Container | ScopedContainer
```

Returns the container from context. Returns `ScopedContainer` if inside a `ScopeProvider`, otherwise returns the root `Container`. Throws if used outside of `ContainerProvider`.

### useRootContainer

```ts
function useRootContainer(): Container
```

Returns the root `Container` regardless of whether you're inside a `ScopeProvider`. Throws if used outside of `ContainerProvider`.

### useService

```ts
function useService<T>(token: ClassType): UseServiceResult<InstanceType<T>>
function useService<T, S>(token: InjectionToken<T, S>, args: InferInput<S>): UseServiceResult<T>
function useService<T>(token: InjectionToken<T, undefined>): UseServiceResult<T>
// ... other overloads

interface UseServiceResult<T> {
  data: T | undefined
  error: Error | undefined
  isLoading: boolean
  isSuccess: boolean
  isError: boolean
  refetch: () => void
}
```

Fetches a service asynchronously and subscribes to invalidation events. When the service is invalidated, it automatically re-fetches.

### useSuspenseService

```ts
function useSuspenseService<T>(token: ClassType): InstanceType<T>
function useSuspenseService<T, S>(token: InjectionToken<T, S>, args: InferInput<S>): T
function useSuspenseService<T>(token: InjectionToken<T, undefined>): T
// ... other overloads
```

Fetches a service using React Suspense. Throws a promise during loading and the resolved value on success. Subscribes to invalidation events and triggers re-render when the service is invalidated.

**Note**: Must be used within a `Suspense` boundary and an error boundary.

### useOptionalService

```ts
function useOptionalService<T>(token: ClassType): UseOptionalServiceResult<InstanceType<T>>
function useOptionalService<T, S>(
  token: InjectionToken<T, S>,
  args: InferInput<S>,
): UseOptionalServiceResult<T>
// ... other overloads

interface UseOptionalServiceResult<T> {
  data: T | undefined
  error: Error | undefined
  isLoading: boolean
  isSuccess: boolean
  isNotFound: boolean
  isError: boolean
  refetch: () => void
}
```

Loads a service that may not be registered. Returns `isNotFound: true` when the service doesn't exist instead of throwing an error.

### useInvalidateInstance

```ts
function useInvalidateInstance(): (instance: unknown) => Promise<void>
```

Returns a function to invalidate a service instance directly without knowing its token.

### useScope

```ts
function useScope(): string | null
```

Returns the current scope ID. Returns `null` if not inside a `ScopeProvider`.

### useScopeOrThrow

```ts
function useScopeOrThrow(): string
```

Returns the current scope ID. Throws an error if not inside a `ScopeProvider`.

### useScopedContainer

```ts
function useScopedContainer(): ScopedContainer | null
```

Returns the current `ScopedContainer`. Returns `null` if not inside a `ScopeProvider`.

### useScopedContainerOrThrow

```ts
function useScopedContainerOrThrow(): ScopedContainer
```

Returns the current `ScopedContainer`. Throws an error if not inside a `ScopeProvider`.

### useScopeMetadata

```ts
function useScopeMetadata<T = unknown>(key: string): T | undefined
```

Returns metadata from the current scope. Returns `undefined` if not inside a `ScopeProvider` or if the key doesn't exist.

## Troubleshooting

### "useContainer must be used within a ContainerProvider"

Make sure your component is wrapped with `ContainerProvider`:

```tsx
<ContainerProvider container={container}>
  <YourComponent />
</ContainerProvider>
```

### Service does not update when arguments change

Arguments are compared by their JSON form. A change JSON cannot see (a different function, class instance, `Map` or `Set`) is not a change for the hook. Pass plain data that identifies the instance:

```tsx
// ❌ Bad - a different formatter instance is not seen as a change
const { data } = useService(ReportToken, { formatter })

// ✅ Good - plain data
const { data } = useService(ReportToken, { locale: formatter.locale })
```

### useSuspenseService throws errors

Make sure you've wrapped your component with both `Suspense` and an error boundary:

```tsx
<ErrorBoundary>
  <Suspense fallback={<Loading />}>
    <Component />
  </Suspense>
</ErrorBoundary>
```

### Services not invalidating

When using `useInvalidateInstance`, make sure you have a reference to the service instance:

```tsx
// ✅ Good - invalidate the actual instance
const { data: user } = useService(UserService)
const invalidateInstance = useInvalidateInstance()

const handleRefresh = () => {
  if (user) {
    invalidateInstance(user)
  }
}
```

## License

MIT
