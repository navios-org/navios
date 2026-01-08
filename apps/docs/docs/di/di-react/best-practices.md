---
sidebar_position: 5
---

# Best Practices

This guide covers best practices for using Navios DI React effectively in your React applications.

## Container Management

### 1. Keep Container Reference Stable

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

### 2. Use useMemo for Dynamic Containers

```tsx
// ✅ Good: Memoized container
const container = useMemo(() => new Container(), [])

// ❌ Bad: New container on every render
const container = new Container()
```

## Hooks Usage

### 1. Memoize Arguments

Always memoize arguments passed to hooks that accept them:

```tsx
// ✅ Good: Memoized args
const args = useMemo(() => ({ userId }), [userId])
const { data } = useService(UserToken, args)

// ❌ Bad: Creates new object on every render
const { data } = useService(UserToken, { userId })
```

### 2. Use Suspense for Cleaner Code

```tsx
// ✅ Good: Use Suspense
function UserProfile() {
  const service = useSuspenseService(UserService)
  return <div>{service.data}</div>
}

<Suspense fallback={<Loading />}>
  <UserProfile />
</Suspense>
```

### 3. Use Error Boundaries with Suspense

```tsx
// ✅ Good: Error boundary with Suspense
<ErrorBoundary FallbackComponent={ErrorFallback}>
  <Suspense fallback={<Loading />}>
    <Component />
  </Suspense>
</ErrorBoundary>
```

## Scope Management

### 1. Use ScopeProvider for Isolation

```tsx
// ✅ Good: Isolated scopes for table rows
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

## Invalidation

### 1. Invalidate After Mutations

```tsx
// ✅ Good: Invalidate after mutations
const { data: items } = useService(ItemService)
const invalidateInstance = useInvalidateInstance()

const handleCreate = async () => {
  await createItem(data)
  if (items) {
    await invalidateInstance(items) // Refresh the list
  }
}
```

### 2. Use refetch for Simple Refreshes

```tsx
// ✅ Good: Use refetch for component-local refresh
const { data, refetch } = useService(UserService)

const handleRefresh = () => {
  refetch() // Re-fetches the service
}
```

## Performance

### 1. Avoid Unnecessary Re-renders

```tsx
// ✅ Good: Memoize to avoid re-renders
const args = useMemo(() => ({ userId }), [userId])
const { data } = useService(UserToken, args)

// ❌ Bad: New object causes re-renders
const { data } = useService(UserToken, { userId })
```

### 2. Use Optional Services for Feature Flags

```tsx
// ✅ Good: Optional service for feature flags
const { data: feature, isNotFound } = useOptionalService(FeatureService)

if (isNotFound) return null // Feature not enabled
```

## Common Pitfalls

### 1. Service Re-fetches on Every Render

**Problem**: Service re-fetches because arguments are not memoized.

**Solution**: Always memoize arguments:

```tsx
// ✅ Good: Memoized args
const args = useMemo(() => ({ userId }), [userId])
const { data } = useService(UserToken, args)
```

### 2. Container Created on Every Render

**Problem**: New container created on every render.

**Solution**: Keep container reference stable:

```tsx
// ✅ Good: Stable container
const container = new Container()
```

## Next Steps

- Review the [guides](/docs/di/di-react/guides/hooks) for detailed usage
- Check out [recipes](/docs/di/di-react/recipes/form-handling) for common patterns
- See the [FAQ](/docs/di/di-react/faq) for answers to common questions

