---
title: Using services in components
---

# Using services in components

Three hooks resolve a service from the container in context. They accept the same things `container.get()` accepts (a class, a token, a bound token or a factory token) and differ in how they report loading and failure:

- `useService` returns the state as an object.
- `useSuspenseService` returns the instance and suspends while it loads.
- `useOptionalService` is `useService` for a token that may have no provider.

All three subscribe to the instance and resolve a new one when it is invalidated; see [Scopes and invalidation](/docs/di/react/scopes-and-invalidation#invalidation). The examples use `UserService` from the [DI quick start](/docs/di/quick-start).

## useService

```tsx
import { useService } from '@navios/di-react'

function UserCard({ userId }: { userId: string }) {
  const { data: users, isLoading, error } = useService(UserService)

  if (error) return <p>{error.message}</p>
  if (isLoading || !users) return <p>Loading…</p>

  return <h2>{users.getUser(userId).name}</h2>
}
```

`data` is the instance once it is ready and `undefined` before that. Narrow on `data` or `isSuccess`, not on `isLoading` alone: on the very first render of an instance that does not exist yet, nothing has started and every flag is `false`. `isLoading` turns `true` right after that render.

When the container already holds the instance, the first render returns it with `isSuccess: true` and the component never shows a loading state.

`refetch()` asks the container again. It returns the same instance unless that instance was destroyed in the meantime, so its use is retrying after an error. To get a new instance, [invalidate](/docs/di/react/scopes-and-invalidation#invalidation) the current one.

## Suspense

`useSuspenseService` returns the instance directly. The component suspends while the service is built and throws to the nearest error boundary when it fails.

```tsx
import { useSuspenseService } from '@navios/di-react'
import { Suspense } from 'react'
import { ErrorBoundary } from 'react-error-boundary'

function UserName({ userId }: { userId: string }) {
  const users = useSuspenseService(UserService)

  return <h2>{users.getUser(userId).name}</h2>
}

function UserPanel() {
  return (
    <ErrorBoundary fallback={<p>Could not load users.</p>}>
      <Suspense fallback={<p>Loading…</p>}>
        <UserName userId="1" />
      </Suspense>
    </ErrorBoundary>
  )
}
```

When the instance is invalidated the component suspends again, so the fallback is shown until the new instance is ready.

:::warning
A failed resolution is remembered for that container, token and arguments. Resetting the error boundary or mounting the component again throws the same error without another attempt. Use `useService` and `refetch()` where a retry is needed.
:::

## Services that take arguments

A [token with a schema](/docs/di/essentials/tokens) takes arguments, and each distinct value of the arguments has its own instance. The hooks take the arguments as their second parameter, typed as the input of the schema.

```ts title="user-profile.ts"
import { inject, Injectable, InjectionToken } from '@navios/di'
import { z } from 'zod/v4'

import { UserService } from './services'

const profileArgs = z.object({ userId: z.string() })

export const USER_PROFILE = InjectionToken.create<UserProfile, typeof profileArgs>(
  'UserProfile',
  profileArgs,
)

@Injectable({ token: USER_PROFILE })
export class UserProfile {
  private readonly users = inject(UserService)
  readonly user

  constructor(args: z.output<typeof profileArgs>) {
    this.user = this.users.getUser(args.userId)
  }
}
```

```tsx
import { useService } from '@navios/di-react'
import { useMemo } from 'react'

function ProfileCard({ userId }: { userId: string }) {
  const args = useMemo(() => ({ userId }), [userId])
  const { data: profile } = useService(USER_PROFILE, args)

  return <h2>{profile?.user.name ?? '…'}</h2>
}
```

Leaving the arguments out turns the hook's return type into an error string that names the missing keys (`'Error: Your token requires args: userId'`), so the first use of the result fails to compile.

:::warning
`useService` and `useOptionalService` compare the arguments by reference. An object literal written in the call is a new object on every render, and the hook starts over each time and never settles. Memoize the object, or use a schema whose value is a primitive (`z.string()`), which needs no memoization. In development the hooks log a warning when two consecutive values serialize to the same JSON but are different objects.
:::

`useSuspenseService` finds its entry by the JSON form of the arguments, so an inline object works there.

When the arguments change, `useService` returns the previous instance for one render, then goes through `isLoading` to the new one. Render from the instance (`profile.user`) rather than from the prop when the two must agree.

### One instance per item

Arguments are the simplest way to give each row of a list its own service: `ProfileCard` above already does it. Every component that passes the same arguments shares the instance, so a row and a toolbar acting on it see the same state.

These instances are singletons of the container: they stay alive after the row unmounts, until they are invalidated or the container is disposed. For state that should end with the component, use a [scope](/docs/di/react/scopes-and-invalidation#one-scope-per-item).

## Optional services

`useOptionalService` returns the same object as `useService` plus `isNotFound`. It is for a token that has a provider in some builds or configurations and none in others.

```tsx
import { InjectionToken } from '@navios/di'
import { useOptionalService } from '@navios/di-react'

interface Analytics {
  track(event: string): void
}

export const ANALYTICS = InjectionToken.create<Analytics>('Analytics')

function SignUpButton() {
  const { data: analytics } = useOptionalService(ANALYTICS)

  return <button onClick={() => analytics?.track('sign-up')}>Sign up</button>
}
```

With no provider for `ANALYTICS`, `isNotFound` is `true` and `error` stays `undefined`. `isNotFound` is also set when the token has a provider but one of its dependencies has none. Any other failure is reported in `error`, including a class that is not decorated with `@Injectable`.

## Errors

`useService` and `useOptionalService` put a failed resolution in `error`; `useSuspenseService` throws it. The value is the `DIError` the container rejected with. Branch on its `code`:

```tsx
import { DIError, DIErrorCode } from '@navios/di'

const { error } = useService(UserService)

if (error instanceof DIError && error.code === DIErrorCode.InitializationError) {
  // the constructor or onServiceInit threw; the original error is error.cause
}
```

The codes a component usually meets are `InitializationError`, `FactoryNotFound` (no provider), `TokenValidationError` (the arguments failed the schema) and `ScopeMismatchError` (a request-scoped service used outside a [`ScopeProvider`](/docs/di/react/scopes-and-invalidation)). The full list is in the [DI API reference](/docs/di/reference/api).

## Outside render

In an event handler or an effect, take the container with `useContainer` and call it directly. It returns the scope when the component is inside a `ScopeProvider` and the root container otherwise.

```tsx
import { useContainer } from '@navios/di-react'

function ExportButton() {
  const container = useContainer()

  const onClick = async () => {
    const users = await container.get(UserService)
    console.log(users.getUser('1'))
  }

  return <button onClick={onClick}>Export</button>
}
```

Nothing is subscribed this way, which is what you want for a service that is only called, never rendered from.

Related: [Scopes and invalidation](/docs/di/react/scopes-and-invalidation), [React API](/docs/di/reference/react-api).
