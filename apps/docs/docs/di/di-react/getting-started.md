---
sidebar_position: 1
---

# Getting Started

Get up and running with Navios DI React in minutes. This guide will walk you through installation, basic setup, and your first React component using dependency injection.

## Installation

Install Navios DI React and its peer dependencies:

```bash
# npm
npm install @navios/di-react @navios/di react

# yarn
yarn add @navios/di-react @navios/di react

# pnpm
pnpm add @navios/di-react @navios/di react
```

:::info
`@navios/di` is a peer dependency required for the DI container. `react` (^18.0.0 || ^19.0.0) is also required.
:::

## Prerequisites

- **React**: 18.0.0 or higher (19.0.0 also supported)
- **@navios/di**: Installed and configured
- **TypeScript**: 4.5 or higher (recommended)

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

### 2. Create a Service

```typescript
import { Injectable } from '@navios/di'

@Injectable()
class UserService {
  async getCurrentUser() {
    return { id: '1', name: 'John Doe', email: 'john@example.com' }
  }
}
```

### 3. Use the Service in a Component

```tsx
import { useService } from '@navios/di-react'
import { UserService } from './services/user-service'

function UserProfile() {
  const { data: user, isLoading, isError, error } = useService(UserService)

  if (isLoading) return <div>Loading...</div>
  if (isError) return <div>Error: {error?.message}</div>

  return (
    <div>
      <h1>{user?.name}</h1>
      <p>{user?.email}</p>
    </div>
  )
}
```

## Complete Example

```tsx
import { Container } from '@navios/di'
import { ContainerProvider, useService } from '@navios/di-react'
import { Injectable } from '@navios/di'

// Define service
@Injectable()
class UserService {
  async getCurrentUser() {
    return { id: '1', name: 'John Doe', email: 'john@example.com' }
  }
}

// Create container
const container = new Container()

// App component
function App() {
  return (
    <ContainerProvider container={container}>
      <UserProfile />
    </ContainerProvider>
  )
}

// Component using service
function UserProfile() {
  const { data: user, isLoading, isError } = useService(UserService)

  if (isLoading) return <div>Loading...</div>
  if (isError) return <div>Error loading user</div>

  return (
    <div>
      <h1>{user?.name}</h1>
      <p>{user?.email}</p>
    </div>
  )
}
```

## Using Suspense

For a cleaner loading experience, use `useSuspenseService` with React Suspense:

```tsx
import { Suspense } from 'react'
import { useSuspenseService } from '@navios/di-react'

function UserProfile() {
  const userService = useSuspenseService(UserService)
  const [user, setUser] = useState(null)

  useEffect(() => {
    userService.getCurrentUser().then(setUser)
  }, [userService])

  return (
    <div>
      <h1>{user?.name}</h1>
      <p>{user?.email}</p>
    </div>
  )
}

function App() {
  return (
    <ContainerProvider container={container}>
      <Suspense fallback={<div>Loading...</div>}>
        <UserProfile />
      </Suspense>
    </ContainerProvider>
  )
}
```

## Key Concepts

### Container Provider

The `ContainerProvider` makes the DI container available to all child components via React context. You should wrap your application root with it.

### Hooks

Navios DI React provides several hooks:

- `useService` - Fetch a service with loading/error states
- `useSuspenseService` - Fetch a service using React Suspense
- `useOptionalService` - Fetch a service that may not be registered
- `useInvalidate` - Get a function to invalidate a service
- `useContainer` - Access the container directly

### Automatic Invalidation

Both `useService` and `useSuspenseService` automatically subscribe to service invalidation events. When a service is invalidated, the hooks will automatically re-fetch the service.

## Next Steps

- Learn about [setup](/docs/di/di-react/guides/setup) for container configuration
- Explore [hooks](/docs/di/di-react/guides/hooks) for all available hooks
- Understand [providers](/docs/di/di-react/guides/providers) for container and scope management
- See [recipes](/docs/di/di-react/recipes/form-handling) for common patterns

