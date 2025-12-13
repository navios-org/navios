# @navios/di-react

React integration for `@navios/di` dependency injection container.

## Installation

```bash
npm install @navios/di-react @navios/di react
# or
yarn add @navios/di-react @navios/di react
```

## Usage

### Setting up the Provider

Wrap your application with `ContainerProvider` and pass a `Container` instance:

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

### useContainer

Access the container directly:

```tsx
import { useContainer } from '@navios/di-react'

function MyComponent() {
  const container = useContainer()

  // Use container methods directly
  const handleClick = async () => {
    const service = await container.get(MyService)
    service.doSomething()
  }

  return <button onClick={handleClick}>Do Something</button>
}
```

### useService

Fetch a service with loading/error states. Automatically re-fetches when the service is invalidated:

```tsx
import { useService } from '@navios/di-react'
import { MyService } from './services/my-service'

function MyComponent() {
  const { data, isLoading, isError, error, refetch } = useService(MyService)

  if (isLoading) return <div>Loading...</div>
  if (isError) return <div>Error: {error?.message}</div>

  return (
    <div>
      <p>{data.someValue}</p>
      <button onClick={refetch}>Refresh</button>
    </div>
  )
}
```

With injection tokens and arguments:

```tsx
import { InjectionToken } from '@navios/di'
import { useService } from '@navios/di-react'
import { z } from 'zod'

const UserToken = InjectionToken.create<User, typeof UserSchema>(
  'User',
  z.object({ userId: z.string() })
)

function UserProfile({ userId }: { userId: string }) {
  const { data: user, isLoading } = useService(UserToken, { userId })

  if (isLoading) return <div>Loading...</div>

  return <div>{user.name}</div>
}
```

### useSuspenseService

Use with React Suspense for a cleaner loading experience. Also subscribes to service invalidation:

```tsx
import { Suspense } from 'react'
import { useSuspenseService } from '@navios/di-react'
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

## API Reference

### ContainerProvider

| Prop | Type | Description |
|------|------|-------------|
| `container` | `Container` | The DI container instance |
| `children` | `ReactNode` | Child components |

### useContainer

```ts
function useContainer(): Container
```

Returns the container from context. Throws if used outside of `ContainerProvider`.

### useService

```ts
function useService<T>(token: ClassType | InjectionToken<T>, args?: unknown): UseServiceResult<T>

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
function useSuspenseService<T>(token: ClassType | InjectionToken<T>, args?: unknown): T
```

Fetches a service using React Suspense. Throws a promise during loading and the resolved value on success. Subscribes to invalidation events and triggers re-render when the service is invalidated.

## Service Invalidation

Both `useService` and `useSuspenseService` subscribe to the service's invalidation events via the DI container's event bus. When a service is invalidated (e.g., via `container.invalidate(service)`), the hooks will automatically:

1. Clear the cached instance
2. Re-fetch the service
3. Update the component with the new instance

This enables reactive updates when services change.

## License

MIT
