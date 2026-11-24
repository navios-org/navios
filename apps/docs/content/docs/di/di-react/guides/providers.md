---
sidebar_position: 3
---

# Providers

Navios DI React provides two providers: `ContainerProvider` and `ScopeProvider`.

## ContainerProvider

The `ContainerProvider` makes the DI container available to all child components via React context.

### Basic Usage

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

### Important: Stable Container Reference

The container prop should be stable. Avoid creating a new container on every render:

```tsx
// ✅ Good: Stable container reference
const container = new Container()

function App() {
  return (
    <ContainerProvider container={container}>
      <YourApp />
    </ContainerProvider>
  )
}

// ❌ Bad: Creates new container on every render
function App() {
  return (
    <ContainerProvider container={new Container()}>
      <YourApp />
    </ContainerProvider>
  )
}
```

### Using useMemo

If you need to create the container dynamically, use `useMemo`:

```tsx
import { useMemo } from 'react'

function App() {
  const container = useMemo(() => new Container(), [])

  return (
    <ContainerProvider container={container}>
      <YourApp />
    </ContainerProvider>
  )
}
```

## ScopeProvider

`ScopeProvider` creates an isolated request scope for dependency injection. Services with `scope: 'Request'` will be instantiated once per scope and shared among all components within that provider.

### Basic Usage

```tsx
import { ScopeProvider } from '@navios/di-react'

function Table({ rows }) {
  return (
    <table>
      {rows.map((row) => (
        <ScopeProvider
          key={row.id}
          scopeId={row.id}
          metadata={{ rowData: row }}
        >
          <TableRow />
        </ScopeProvider>
      ))}
    </table>
  )
}
```

### Use Cases

- **Table rows** that need isolated state
- **Modal dialogs** with their own service instances
- **Multi-tenant scenarios**
- **Any case where you need isolated service instances**

### With Metadata

```tsx
function UserDashboard({ userId }: { userId: string }) {
  return (
    <ScopeProvider
      scopeId={`user-${userId}`}
      metadata={{ userId, timestamp: Date.now() }}
    >
      <UserProfile />
      <UserSettings />
    </ScopeProvider>
  )
}
```

### Nested Scopes

You can nest `ScopeProvider` components:

```tsx
function App() {
  return (
    <ScopeProvider scopeId="app-scope">
      <ScopeProvider scopeId="user-scope" metadata={{ userId: '123' }}>
        <UserComponent />
      </ScopeProvider>
    </ScopeProvider>
  )
}
```

## Props Reference

### ContainerProvider

| Prop        | Type        | Description                                  |
| ----------- | ----------- | -------------------------------------------- |
| `container` | `Container` | The DI container instance (should be stable) |
| `children`  | `ReactNode` | Child components                             |

### ScopeProvider

| Prop       | Type                       | Description                                                                | Default     |
| ---------- | -------------------------- | -------------------------------------------------------------------------- | ----------- |
| `scopeId`  | `string?`                  | Optional explicit scope ID. If not provided, a unique ID will be generated | `undefined` |
| `metadata` | `Record<string, unknown>?` | Optional metadata to attach to the request context                         | `undefined` |
| `priority` | `number?`                  | Priority for service resolution. Higher priority scopes take precedence    | `100`       |
| `children` | `ReactNode`                | Child components                                                           | -           |

## Best Practices

### 1. Keep Container Stable

```tsx
// ✅ Good: Stable container
const container = new Container()

// ❌ Bad: New container on every render
<ContainerProvider container={new Container()}>
```

### 2. Use ScopeProvider for Isolation

```tsx
// ✅ Good: Isolated scopes for table rows
{rows.map((row) => (
  <ScopeProvider key={row.id} scopeId={row.id}>
    <TableRow />
  </ScopeProvider>
))}
```

### 3. Provide Meaningful Scope IDs

```tsx
// ✅ Good: Descriptive scope IDs
<ScopeProvider scopeId={`user-${userId}`}>

// ❌ Avoid: Generic scope IDs
<ScopeProvider scopeId="scope">
```

## Next Steps

- Learn about [scopes](/docs/di/di-react/guides/scopes) for request scoping in React
- Explore [hooks](/docs/di/di-react/guides/hooks) for using services
- See [recipes](/docs/di/di-react/recipes/table-rows) for real-world examples

