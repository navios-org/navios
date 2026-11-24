---
sidebar_position: 4
---

# Scopes in React

This guide covers how to use request scopes in React applications with `ScopeProvider`.

## Overview

`ScopeProvider` creates isolated request scopes for dependency injection. Services with `scope: 'Request'` will be instantiated once per scope and shared among all components within that provider.

## Basic Usage

```tsx
import { ScopeProvider } from '@navios/di-react'

function Table({ rows }) {
  return (
    <table>
      {rows.map((row) => (
        <ScopeProvider key={row.id} scopeId={row.id}>
          <TableRow />
        </ScopeProvider>
      ))}
    </table>
  )
}
```

## Table Rows Example

Each table row gets its own isolated service instance:

```tsx
import { Injectable, InjectableScope } from '@navios/di'
import { ScopeProvider, useService } from '@navios/di-react'

@Injectable({ scope: InjectableScope.Request })
class RowService {
  private data: any

  setData(data: any) {
    this.data = data
  }

  getData() {
    return this.data
  }
}

function TableRow({ row }) {
  const { data: rowService } = useService(RowService)

  useEffect(() => {
    rowService?.setData(row)
  }, [rowService, row])

  return <tr>{/* Row content */}</tr>
}

function Table({ rows }) {
  return (
    <table>
      {rows.map((row) => (
        <ScopeProvider key={row.id} scopeId={row.id}>
          <TableRow row={row} />
        </ScopeProvider>
      ))}
    </table>
  )
}
```

## Modal Dialogs Example

Each modal gets its own isolated service instance:

```tsx
function Modal({ isOpen, onClose, children }) {
  if (!isOpen) return null

  return (
    <ScopeProvider scopeId={`modal-${Date.now()}`}>
      <ModalDialog onClose={onClose}>{children}</ModalDialog>
    </ScopeProvider>
  )
}
```

## Accessing Scope Information

### useScope

Get the current scope ID:

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

Get the current scope ID, throwing an error if not inside a `ScopeProvider`:

```tsx
import { useScopeOrThrow } from '@navios/di-react'

function MyComponent() {
  const scopeId = useScopeOrThrow() // Throws if not in ScopeProvider

  return <div>Current scope: {scopeId}</div>
}
```

### useScopeMetadata

Get metadata from the current scope:

```tsx
import { useScopeMetadata } from '@navios/di-react'

function ChildComponent() {
  const userId = useScopeMetadata<string>('userId')
  const theme = useScopeMetadata<'light' | 'dark'>('theme')

  return (
    <div>
      User: {userId}, Theme: {theme}
    </div>
  )
}

// In parent component:
<ScopeProvider metadata={{ userId: '123', theme: 'dark' }}>
  <ChildComponent />
</ScopeProvider>
```

## Best Practices

### 1. Use ScopeProvider for Isolation

```tsx
// ✅ Good: Isolated scopes for each row
{rows.map((row) => (
  <ScopeProvider key={row.id} scopeId={row.id}>
    <TableRow />
  </ScopeProvider>
))}
```

### 2. Provide Meaningful Scope IDs

```tsx
// ✅ Good: Descriptive scope IDs
<ScopeProvider scopeId={`user-${userId}`}>

// ❌ Avoid: Generic scope IDs
<ScopeProvider scopeId="scope">
```

### 3. Use Metadata for Context

```tsx
// ✅ Good: Provide context via metadata
<ScopeProvider
  scopeId={`order-${orderId}`}
  metadata={{ orderId, userId, timestamp: Date.now() }}
>
  <OrderDetails />
</ScopeProvider>
```

## Next Steps

- Learn about [invalidation](/docs/di/di-react/guides/invalidation) for service invalidation
- Explore [providers](/docs/di/di-react/guides/providers) for more details
- See [recipes](/docs/di/di-react/recipes/table-rows) for real-world examples

