---
title: Quick start
---

# Quick start

`@navios/di-react` connects a `@navios/di` container to a React tree. A provider puts the container in context, and hooks resolve services from it, re-render when a service is invalidated, and create scopes that live as long as a component. This page continues from the [DI quick start](/docs/di/quick-start) and uses the `DatabaseService` and `UserService` declared there.

## Install

```bash
npm install @navios/di-react@next @navios/di@next
```

React 18 and 19 are supported. The services are compiled by your bundler, so it has to handle standard decorators the same way the [DI quick start](/docs/di/quick-start) asks of `tsconfig.json`: `experimentalDecorators` stays off.

## Provide the container

Create one container for the application, outside any component, and hand it to `ContainerProvider`.

```tsx title="main.tsx"
import { Container } from '@navios/di'
import { ContainerProvider } from '@navios/di-react'
import { createRoot } from 'react-dom/client'

import { App } from './app'

const container = new Container()

createRoot(document.getElementById('root')!).render(
  <ContainerProvider container={container}>
    <App />
  </ContainerProvider>,
)
```

The container holds every singleton, so it must be the same object on every render. If it has to be created inside a component, keep it in `useState(() => new Container())`.

Everything a container accepts works here unchanged. To replace a dependency for a test or a Storybook story, pass [`providers`](/docs/di/essentials/providers) to the container you give to `ContainerProvider`.

## Use a service

`useService` resolves a service and returns it with its loading state.

```tsx title="user-card.tsx"
import { useService } from '@navios/di-react'

import { UserService } from './services'

export function UserCard({ userId }: { userId: string }) {
  const { data: users, error } = useService(UserService)

  if (error) return <p>{error.message}</p>
  if (!users) return <p>Loading…</p>

  return <h2>{users.getUser(userId).name}</h2>
}
```

`users` is typed as `UserService | undefined`. It is `undefined` until the instance is ready: the hook resolves with the container's asynchronous `get()`, because a service or one of its dependencies may have an asynchronous `onServiceInit`. When the instance already exists, the first render returns it with no loading state.

Every component that asks for `UserService` gets the same instance, the one the container holds. `UserService` injects `DatabaseService` on its own; components never see the dependency graph.

## Or suspend

`useSuspenseService` returns the instance itself and lets a `Suspense` boundary show the loading state.

```tsx
import { useSuspenseService } from '@navios/di-react'
import { Suspense } from 'react'

import { UserService } from './services'

function UserName({ userId }: { userId: string }) {
  const users = useSuspenseService(UserService)

  return <h2>{users.getUser(userId).name}</h2>
}

export function UserPanel() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <UserName userId="1" />
    </Suspense>
  )
}
```

Related: [Using services in components](/docs/di/react/using-services), [Scopes and invalidation](/docs/di/react/scopes-and-invalidation), [React API](/docs/di/reference/react-api).
