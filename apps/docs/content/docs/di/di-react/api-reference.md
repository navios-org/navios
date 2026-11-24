---
sidebar_position: 4
---

# API Reference

Complete API reference for Navios DI React.

## Providers

### ContainerProvider

Makes the DI container available to all child components via React context.

```tsx
interface ContainerProviderProps {
  container: Container
  children: ReactNode
}
```

**Props:**

- `container: Container` - The DI container instance (should be stable)
- `children: ReactNode` - Child components

### ScopeProvider

Creates an isolated request scope for dependency injection.

```tsx
interface ScopeProviderProps {
  scopeId?: string
  metadata?: Record<string, unknown>
  priority?: number
  children: ReactNode
}
```

**Props:**

- `scopeId?: string` - Optional explicit scope ID. If not provided, a unique ID will be generated
- `metadata?: Record<string, unknown>` - Optional metadata to attach to the request context
- `priority?: number` - Priority for service resolution. Higher priority scopes take precedence (default: 100)
- `children: ReactNode` - Child components

## Hooks

### useContainer

Access the container directly. Automatically returns the `ScopedContainer` if inside a `ScopeProvider`, otherwise returns the root `Container`.

```tsx
function useContainer(): IContainer
```

**Returns:** The container from context. Returns `ScopedContainer` if inside a `ScopeProvider`, otherwise returns the root `Container`. Throws if used outside of `ContainerProvider`.

### useRootContainer

Get the root container regardless of whether you're inside a `ScopeProvider`.

```tsx
function useRootContainer(): Container
```

**Returns:** The root `Container` regardless of whether you're inside a `ScopeProvider`. Throws if used outside of `ContainerProvider`.

### useService

Fetch a service with loading/error states. Automatically re-fetches when the service is invalidated.

```tsx
function useService<T>(token: ClassType): UseServiceResult<InstanceType<T>>
function useService<T, S>(
  token: InjectionToken<T, S>,
  args: z.input<S>,
): UseServiceResult<T>
function useService<T>(token: InjectionToken<T, undefined>): UseServiceResult<T>

interface UseServiceResult<T> {
  data: T | undefined
  error: Error | undefined
  isLoading: boolean
  isSuccess: boolean
  isError: boolean
  refetch: () => void
}
```

**Returns:** An object with service data, loading/error states, and a refetch function.

### useSuspenseService

Use with React Suspense for a cleaner loading experience. Also subscribes to service invalidation.

```tsx
function useSuspenseService<T>(token: ClassType): InstanceType<T>
function useSuspenseService<T, S>(
  token: InjectionToken<T, S>,
  args: z.input<S>,
): T
function useSuspenseService<T>(token: InjectionToken<T, undefined>): T
```

**Returns:** The service instance. Throws a promise during loading and the resolved value on success. Subscribes to invalidation events and triggers re-render when the service is invalidated.

**Note:** Must be used within a `Suspense` boundary and an error boundary.

### useOptionalService

Load a service that may not be registered. Unlike `useService`, this hook does NOT throw an error if the service is not registered.

```tsx
function useOptionalService<T>(
  token: ClassType,
): UseOptionalServiceResult<InstanceType<T>>
function useOptionalService<T, S>(
  token: InjectionToken<T, S>,
  args: z.input<S>,
): UseOptionalServiceResult<T>

interface UseOptionalServiceResult<T> {
  data: T | undefined
  error: Error | undefined
  isLoading: boolean
  isSuccess: boolean
  isNotFound: boolean
  isError: boolean
  refetch: () => void
}
```

**Returns:** An object with service data, loading/error states, and an `isNotFound` flag.

### useInvalidateInstance

Get a function to invalidate a service instance. When called, destroys the current service instance and triggers re-fetch in all components using `useService`/`useSuspenseService` for that service.

```tsx
function useInvalidateInstance(): (instance: unknown) => Promise<void>
```

**Returns:** A function that takes a service instance and invalidates it. Use this when you have the service instance and want to trigger a refresh.

**Example:**

```tsx
function UserProfile() {
  const { data: user } = useService(UserService)
  const invalidateInstance = useInvalidateInstance()

  const handleRefresh = async () => {
    if (user) {
      await invalidateInstance(user)
      // All components using UserService will re-fetch
    }
  }

  return (
    <div>
      <span>{user?.name}</span>
      <button onClick={handleRefresh}>Refresh</button>
    </div>
  )
}
```

### useScope

Get the current scope ID.

```tsx
function useScope(): string | null
```

**Returns:** The current scope ID. Returns `null` if not inside a `ScopeProvider`.

### useScopeOrThrow

Get the current scope ID, throwing an error if not inside a `ScopeProvider`.

```tsx
function useScopeOrThrow(): string
```

**Returns:** The current scope ID. Throws an error if not inside a `ScopeProvider`.

### useScopedContainer

Get the current `ScopedContainer`.

```tsx
function useScopedContainer(): ScopedContainer | null
```

**Returns:** The current `ScopedContainer`. Returns `null` if not inside a `ScopeProvider`.

### useScopedContainerOrThrow

Get the current `ScopedContainer`, throwing an error if not inside a `ScopeProvider`.

```tsx
function useScopedContainerOrThrow(): ScopedContainer
```

**Returns:** The current `ScopedContainer`. Throws an error if not inside a `ScopeProvider`.

### useScopeMetadata

Get metadata from the current scope.

```tsx
function useScopeMetadata<T = unknown>(key: string): T | undefined
```

**Returns:** Metadata from the current scope. Returns `undefined` if not inside a `ScopeProvider` or if the key doesn't exist.

## Next Steps

- Explore the [guides](/docs/di/di-react/guides/hooks) for detailed usage examples
- Check out [recipes](/docs/di/di-react/recipes/form-handling) for common patterns
- Review [best practices](/docs/di/di-react/best-practices) for React-specific recommendations

