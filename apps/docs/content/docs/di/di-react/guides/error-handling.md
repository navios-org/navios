---
sidebar_position: 7
---

# Error Handling

This guide covers error handling patterns in Navios DI React.

## useService Error Handling

`useService` provides error states:

```tsx
import { useService } from '@navios/di-react'

function UserProfile() {
  const { data, isLoading, isError, error } = useService(UserService)

  if (isLoading) return <div>Loading...</div>
  if (isError) return <div>Error: {error?.message}</div>

  return <div>{data?.name}</div>
}
```

## useSuspenseService Error Handling

When using `useSuspenseService`, errors are thrown to the nearest error boundary:

```tsx
import { ErrorBoundary } from 'react-error-boundary'
import { Suspense } from 'react'
import { useSuspenseService } from '@navios/di-react'

function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div>
      <h2>Something went wrong:</h2>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  )
}

function UserProfile() {
  const userService = useSuspenseService(UserService)
  // Errors are thrown to error boundary
}

function App() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Suspense fallback={<div>Loading...</div>}>
        <UserProfile />
      </Suspense>
    </ErrorBoundary>
  )
}
```

## useOptionalService Error Handling

`useOptionalService` returns `isNotFound` instead of throwing:

```tsx
import { useOptionalService } from '@navios/di-react'

function Analytics() {
  const {
    data: analytics,
    isNotFound,
    isLoading,
    isError,
    error,
  } = useOptionalService(AnalyticsService)

  if (isLoading) return null
  if (isError) return <div>Error: {error?.message}</div>
  if (isNotFound) return null // Service not configured

  return <AnalyticsTracker service={analytics} />
}
```

## Best Practices

### 1. Use Error Boundaries with Suspense

```tsx
// ✅ Good: Error boundary with Suspense
<ErrorBoundary FallbackComponent={ErrorFallback}>
  <Suspense fallback={<Loading />}>
    <Component />
  </Suspense>
</ErrorBoundary>
```

### 2. Handle Errors Gracefully

```tsx
// ✅ Good: Graceful error handling
if (isError) {
  return <ErrorDisplay error={error} onRetry={refetch} />
}
```

### 3. Use Optional Services for Feature Flags

```tsx
// ✅ Good: Optional service for feature flags
const { data: feature, isNotFound } = useOptionalService(FeatureService)

if (isNotFound) return null // Feature not enabled
```

## Next Steps

- Learn about [suspense](/docs/di/di-react/guides/suspense) for React Suspense integration
- Explore [hooks](/docs/di/di-react/guides/hooks) for all available hooks
- See [best practices](/docs/di/di-react/best-practices) for more recommendations

