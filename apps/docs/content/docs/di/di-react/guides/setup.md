---
sidebar_position: 1
---

# Setup

This guide covers how to set up Navios DI React in your application.

## Basic Setup

### 1. Create a Container

Create a container instance. It's recommended to create it outside of your component to ensure it's stable:

```tsx
import { Container } from '@navios/di'
import { ContainerProvider } from '@navios/di-react'

// Create container outside component
const container = new Container()

function App() {
  return (
    <ContainerProvider container={container}>
      <YourApp />
    </ContainerProvider>
  )
}
```

### 2. Using useMemo for Dynamic Containers

If you need to create the container dynamically, use `useMemo`:

```tsx
import { useMemo } from 'react'
import { Container } from '@navios/di'
import { ContainerProvider } from '@navios/di-react'

function App() {
  const container = useMemo(() => new Container(), [])

  return (
    <ContainerProvider container={container}>
      <YourApp />
    </ContainerProvider>
  )
}
```

### 3. Using useState for Container Management

For more complex scenarios, you can use `useState`:

```tsx
import { useState } from 'react'
import { Container } from '@navios/di'
import { ContainerProvider } from '@navios/di-react'

function App() {
  const [container] = useState(() => new Container())

  return (
    <ContainerProvider container={container}>
      <YourApp />
    </ContainerProvider>
  )
}
```

## Container Initialization

### Pre-initializing Services

You can pre-initialize services before rendering:

```tsx
import { useEffect, useState } from 'react'
import { Container } from '@navios/di'
import { ContainerProvider } from '@navios/di-react'

function App() {
  const [container] = useState(() => new Container())
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    async function initialize() {
      // Pre-initialize services
      await container.get(DatabaseService)
      await container.get(CacheService)
      setIsReady(true)
    }
    initialize()
  }, [container])

  if (!isReady) {
    return <div>Initializing...</div>
  }

  return (
    <ContainerProvider container={container}>
      <YourApp />
    </ContainerProvider>
  )
}
```

## Best Practices

### 1. Keep Container Reference Stable

```tsx
// ✅ Good: Stable container reference
const container = new Container()

// ❌ Bad: Creates new container on every render
function App() {
  return (
    <ContainerProvider container={new Container()}>
      <YourApp />
    </ContainerProvider>
  )
}
```

### 2. Use useMemo for Dynamic Containers

```tsx
// ✅ Good: Memoized container
const container = useMemo(() => new Container(), [])

// ❌ Bad: New container on every render
const container = new Container()
```

### 3. Initialize Services Early

```tsx
// ✅ Good: Pre-initialize critical services
useEffect(() => {
  container.get(CriticalService)
}, [container])
```

## Next Steps

- Learn about [hooks](/docs/di/di-react/guides/hooks) for using services
- Explore [providers](/docs/di/di-react/guides/providers) for advanced setup
- See [best practices](/docs/di/di-react/best-practices) for more recommendations

