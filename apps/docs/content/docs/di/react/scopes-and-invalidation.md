---
title: Scopes and invalidation
---

# Scopes and invalidation

A singleton lives as long as the container. Two tools give a service a shorter life in React: `ScopeProvider` ties request-scoped services to a part of the component tree, and invalidation replaces one instance on demand. What a scope is and what invalidation destroys are DI concepts, explained in [Scopes](/docs/di/essentials/scopes) and [Invalidation](/docs/di/guides/invalidation); this page covers their React side.

## ScopeProvider

`ScopeProvider` creates a scope with `container.createScope()` when it mounts and disposes it when it unmounts. Hooks below it resolve from that scope, so a service declared with `InjectableScope.Request` has one instance per provider, shared by every component inside it.

```ts title="user-draft.ts"
import { Injectable, InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Request })
export class UserDraft {
  name = ''

  onServiceDestroy() {
    // runs when the ScopeProvider unmounts
  }
}
```

```tsx
import { ScopeProvider, useService } from '@navios/di-react'

function NameField() {
  const { data: draft } = useService(UserDraft)
  // ...
}

function EditUserForm() {
  return (
    <ScopeProvider>
      <NameField />
      <SaveButton /> {/* gets the same UserDraft */}
    </ScopeProvider>
  )
}
```

Singletons are unaffected: inside a scope `useService(UserService)` still returns the container's one instance. A request-scoped service used outside any `ScopeProvider` fails with a `ScopeMismatchError`.

A `ScopeProvider` inside another one starts an independent scope. Components see the innermost one, and the outer scope's request-scoped instances are not visible through it.

The scope is disposed one microtask after the provider unmounts, so the simulated unmount of React's `<StrictMode>` does not lose it. An `<Activity>` that hides the provider does dispose the scope, and showing it again starts a new one.

:::warning
Put a `<Suspense>` boundary for `useSuspenseService` inside the `ScopeProvider`, not around it. A boundary outside makes React discard and retry the provider, which starts a new scope on every attempt, so a request-scoped service never settles.
:::

## Scope id and metadata

Both props are optional. `scopeId` names the scope; without it React's `useId` supplies one. `metadata` is a record of values for the components inside.

```tsx
import { ScopeProvider, useScope, useScopeMetadata } from '@navios/di-react'

import type { ReactNode } from 'react'

function TenantArea({ tenantId, children }: { tenantId: string; children: ReactNode }) {
  return (
    <ScopeProvider key={tenantId} scopeId={`tenant-${tenantId}`} metadata={{ tenantId }}>
      {children}
    </ScopeProvider>
  )
}

function TenantBadge() {
  const scopeId = useScope() // 'tenant-acme', or null outside a ScopeProvider
  const tenantId = useScopeMetadata<string>('tenantId')

  return <span title={scopeId ?? undefined}>{tenantId}</span>
}
```

The props are read once, when the provider mounts. Changing them later does nothing; change the `key`, as above, to throw the scope away and start a new one. The metadata key `scopeId` is reserved: it always holds the scope id.

`useScopedContainer()` returns the `ScopedContainer` itself. `useScope` and `useScopedContainer` have `OrThrow` variants for components that only make sense inside a scope; see the [React API](/docs/di/reference/react-api#scope-hooks).

## One scope per item

Wrap each item of a list in its own `ScopeProvider` and every row gets a private set of request-scoped services. Unlike [instances selected by arguments](/docs/di/react/using-services#one-instance-per-item), they are destroyed when the row unmounts.

```tsx
function UserTable({ users }: { users: { id: string }[] }) {
  return (
    <table>
      <tbody>
        {users.map((user) => (
          <ScopeProvider key={user.id} metadata={{ userId: user.id }}>
            <UserRow />
          </ScopeProvider>
        ))}
      </tbody>
    </table>
  )
}

function UserRow() {
  const userId = useScopeMetadata<string>('userId')
  const { data: draft } = useService(UserDraft) // this row's own draft
  // ...
}
```

## A scope per modal or tenant

The same mechanism covers two other common cases.

A modal that mounts a `ScopeProvider` with its content starts from clean state every time it opens, and `onServiceDestroy` runs when it closes:

```tsx
function EditUserModal({ open }: { open: boolean }) {
  if (!open) return null

  return (
    <ScopeProvider>
      <EditUserFields />
    </ScopeProvider>
  )
}
```

For tenants or workspaces, put a keyed `ScopeProvider` around the tenant-specific part of the app, as `TenantArea` does above. Switching tenant changes the key, which disposes the old scope and every request-scoped cache, connection or store in it. Singletons such as an API client stay shared across tenants.

## Invalidation

`useService`, `useSuspenseService` and `useOptionalService` listen for the destruction of the instance they returned. When it is invalidated they resolve again and the component re-renders with the new instance. `useInvalidateInstance` returns a function that invalidates an instance you hold:

```tsx
import { useInvalidateInstance, useService } from '@navios/di-react'

function ResetDraftButton() {
  const { data: draft } = useService(UserDraft)
  const invalidate = useInvalidateInstance()

  return (
    <button disabled={!draft} onClick={() => invalidate(draft)}>
      Discard changes
    </button>
  )
}
```

Every component using that `UserDraft` receives the replacement, wherever the call came from. The same is true of `container.invalidate()` called outside React, for example from another service.

Three things follow from the [DI rules](/docs/di/guides/invalidation):

- Invalidation is by instance, not by token. A service created with arguments is invalidated one arguments value at a time.
- Services that injected the invalidated instance are destroyed with it, so components holding one of those get a new instance too.
- The function resolves when destruction is finished, including `onServiceDestroy` hooks. It works from inside a scope for both the scope's instances and the container's singletons.

With `useService` the component passes through `isLoading` and `data` is `undefined` for that time. With `useSuspenseService` the fallback is shown.

The replacement is a new object built from scratch. Invalidation fits state that should be dropped and rebuilt: a draft, a session, a cache. It is not a change notification: mutating a field of a service does not re-render anything. For values that change while the instance stays, expose them through a store the service owns and subscribe to it with `useSyncExternalStore`.

Related: [Using services in components](/docs/di/react/using-services), [React API](/docs/di/reference/react-api).
