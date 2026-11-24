---
sidebar_position: 6
---

# FAQ

Frequently asked questions and troubleshooting guide for Navios DI React.

## Common Questions

### How do I set up the container?

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

### How do I use a service in a component?

Use the `useService` hook:

```tsx
import { useService } from '@navios/di-react'

function MyComponent() {
  const { data, isLoading, isError } = useService(MyService)

  if (isLoading) return <div>Loading...</div>
  if (isError) return <div>Error</div>

  return <div>{data?.value}</div>
}
```

### What's the difference between useService and useSuspenseService?

- `useService` - Returns loading/error states, works without Suspense
- `useSuspenseService` - Uses React Suspense, requires Suspense boundary

### How do I invalidate a service?

Use the `useInvalidateInstance` hook:

```tsx
import { useService, useInvalidateInstance } from '@navios/di-react'

function MyComponent() {
  const { data: service } = useService(MyService)
  const invalidateInstance = useInvalidateInstance()

  const handleRefresh = async () => {
    if (service) {
      await invalidateInstance(service) // All components using MyService will re-fetch
    }
  }

  return <button onClick={handleRefresh}>Refresh</button>
}
```

Alternatively, use the `refetch` function from `useService` for component-local refresh:

```tsx
const { data, refetch } = useService(MyService)

const handleRefresh = () => {
  refetch()
}
```

### How do I use request-scoped services?

Use `ScopeProvider`:

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

## Troubleshooting

### Error: "useContainer must be used within a ContainerProvider"

**Problem**: Component is not wrapped with `ContainerProvider`.

**Solution**: Wrap your app with `ContainerProvider`:

```tsx
<ContainerProvider container={container}>
  <YourComponent />
</ContainerProvider>
```

### Service Re-fetches on Every Render

**Problem**: Arguments are not memoized.

**Solution**: Always memoize arguments:

```tsx
// ✅ Good: Memoized args
const args = useMemo(() => ({ userId }), [userId])
const { data } = useService(UserToken, args)

// ❌ Bad: New object on every render
const { data } = useService(UserToken, { userId })
```

### useSuspenseService Throws Errors

**Problem**: Component not wrapped with Suspense and error boundary.

**Solution**: Wrap with both Suspense and error boundary:

```tsx
<ErrorBoundary FallbackComponent={ErrorFallback}>
  <Suspense fallback={<Loading />}>
    <Component />
  </Suspense>
</ErrorBoundary>
```

### Services Not Invalidating

**Problem**: Invalidation not working as expected.

**Solution**: Use `useInvalidateInstance` with the actual service instance:

```tsx
// ✅ Good: Invalidate the actual instance
const { data: user } = useService(UserService)
const invalidateInstance = useInvalidateInstance()

const handleRefresh = async () => {
  if (user) {
    await invalidateInstance(user)
  }
}
```

For simple refreshes within a component, use the `refetch` function:

```tsx
// ✅ Good: Use refetch for local refresh
const { data, refetch } = useService(UserService)

const handleRefresh = () => {
  refetch()
}
```

## Getting Help

- Check the [API Reference](/docs/di/di-react/api-reference) for complete method signatures
- Review the [Guides](/docs/di/di-react/guides/hooks) for detailed usage examples
- See [Best Practices](/docs/di/di-react/best-practices) for design recommendations
- Visit the [GitHub repository](https://github.com/Arilas/navios) for issues and discussions

