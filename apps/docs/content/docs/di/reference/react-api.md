---
title: React API
---

# React API

Every public export of `@navios/di-react`, with signatures. This page is for looking things up; the [React guides](/docs/di/react/) explain how the pieces are used. Peer dependencies: `@navios/di` and `react` `^18.0.0 || ^19.0.0`.

## ContainerProvider

```tsx
<ContainerProvider container={container}>{children}</ContainerProvider>
```

| `ContainerProviderProps` | Type        | Description                                                 |
| ------------------------ | ----------- | ----------------------------------------------------------- |
| `container`              | `Container` | The root container. Must be the same object on every render |
| `children`               | `ReactNode` | The tree that can use the hooks                             |

Every hook on this page throws when there is no `ContainerProvider` above it, with a message such as `useContainer must be used within a ContainerProvider`, except the [scope hooks](#scope-hooks) that return `null` or `undefined`.

## ScopeProvider

```tsx
<ScopeProvider scopeId="row-1" metadata={{ userId: '1' }}>{children}</ScopeProvider>
```

| `ScopeProviderProps` | Type                      | Default         | Description                                                                             |
| -------------------- | ------------------------- | --------------- | --------------------------------------------------------------------------------------- |
| `scopeId`            | `string`                  | React `useId()` | Id of the scope, returned by `useScope()`                                               |
| `metadata`           | `Record<string, unknown>` | none            | Passed to `container.createScope()`. The key `scopeId` is overwritten with the scope id |
| `children`           | `ReactNode`               |                 | The tree that resolves from the scope                                                   |

Creates one `ScopedContainer` from the root container on mount and calls its `dispose()` on unmount. `scopeId` and `metadata` are read on mount only. Nested providers create independent scopes. Throws `ScopeProvider must be used within a ContainerProvider` without one. See [Scopes and invalidation](/docs/di/react/scopes-and-invalidation#scopeprovider).

## Service hooks

All three hooks share one set of overloads, the interface `ServiceHook<K>`: `useService` is a `ServiceHook<'service'>`, `useOptionalService` a `ServiceHook<'optional'>` and `useSuspenseService` a `ServiceHook<'suspense'>`. `Result` stands for the hook's return type, `ServiceHookResults<T>[K]`.

```ts
// A class registered with @Injectable or @Factory
useService(token: ClassType): Result<Instance>

// A token with a schema: arguments are required
useService<T, S>(token: InjectionToken<T, S>, args: InferInput<S>): Result<T>

// A token without a schema, a bound token, a factory token
useService<T>(token: InjectionToken<T, undefined>): Result<T>
useService<T>(token: BoundInjectionToken<T, any>): Result<T>
useService<T>(token: FactoryInjectionToken<T, any>): Result<T>
```

For a class decorated with `@Factory`, `Instance` is the type its `create()` returns. Calling a hook with a schema token and no arguments gives it the return type `MissingArgsError<S>` from `@navios/di`, a string literal naming the missing keys, so the first use of the result fails to compile.

Each hook resolves from the nearest `ScopeProvider`'s scope, or from the root container when there is none, and resolves again when the instance is destroyed.

### useService

```ts
function useService(token, args?): UseServiceResult<T>

interface UseServiceResult<T> {
  data: T | undefined
  error: Error | undefined
  isLoading: boolean
  isSuccess: boolean
  isError: boolean
  refetch: () => void
}
```

| Field       | Description                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| `data`      | The instance, once resolved                                                                             |
| `error`     | What `container.get()` rejected with, normally a `DIError`                                              |
| `isLoading` | A resolution is in progress. `true` on the first render unless the container already holds the instance |
| `isSuccess` | `data` is set. `true` on the first render when the container already holds the instance                 |
| `isError`   | `error` is set                                                                                          |
| `refetch`   | Calls `container.get()` again. Returns the existing instance when there is one                          |

`args` is compared by its JSON form; a new object with the same content does not restart the resolution. See [Using services in components](/docs/di/react/using-services#useservice).

### useSuspenseService

```ts
function useSuspenseService(token, args?): T
```

Returns the instance. Throws a promise while it is being resolved and the error when resolution fails, so it needs a `Suspense` boundary and an error boundary above it. Results are cached per container, token and the JSON form of `args`. A failure is not kept: once it has reached the error boundary, the next render, such as the one after a reset of the boundary, resolves again. See [Suspense](/docs/di/react/using-services#suspense).

### useOptionalService

```ts
function useOptionalService(token, args?): UseOptionalServiceResult<T>

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

The fields of [`UseServiceResult`](#useservice) plus `isNotFound`. It is `true`, and `error` is `undefined`, when resolution fails because a provider is missing. Other failures are reported as in `useService`. See [Optional services](/docs/di/react/using-services#optional-services).

## useInvalidateInstance

```ts
function useInvalidateInstance(): (instance: unknown) => Promise<void>
```

Returns a stable function that calls `invalidate(instance)` on the current container (the scope inside a `ScopeProvider`). The promise resolves when the instance and its dependents are destroyed. A value the container does not hold is ignored. See [Invalidation](/docs/di/react/scopes-and-invalidation#invalidation).

## Container hooks

| Hook               | Returns                        | Description                                                              |
| ------------------ | ------------------------------ | ------------------------------------------------------------------------ |
| `useContainer`     | `Container \| ScopedContainer` | The scope when inside a `ScopeProvider`, otherwise the root container    |
| `useRootContainer` | `Container`                    | The root container, also inside a `ScopeProvider`                        |

## Scope hooks

| Hook                        | Returns                   | Outside a `ScopeProvider` |
| --------------------------- | ------------------------- | ------------------------- |
| `useScope`                  | `string \| null`          | `null`                    |
| `useScopeOrThrow`           | `string`                  | throws                    |
| `useScopedContainer`        | `ScopedContainer \| null` | `null`                    |
| `useScopedContainerOrThrow` | `ScopedContainer`         | throws                    |
| `useScopeMetadata<T>(key)`  | `T \| undefined`          | `undefined`               |

`useScope` returns the scope id. `useScopeMetadata` returns `scope.getMetadata(key)` cast to `T`, and `undefined` for a key that was not set. All of them read the innermost scope.

## Contexts

```ts
const ContainerContext: React.Context<Container | null>
const ScopedContainerContext: React.Context<ScopedContainer | null>
```

The two contexts behind the providers and hooks. They are exported for code that has to read or supply them directly, for example a test helper; application code uses the providers.

## Types

| Export                        | Description                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ContainerProviderProps`      | Props of [`ContainerProvider`](#containerprovider)                                                     |
| `ScopeProviderProps`          | Props of [`ScopeProvider`](#scopeprovider)                                                             |
| `UseServiceResult<T>`         | Return type of [`useService`](#useservice)                                                             |
| `UseOptionalServiceResult<T>` | Return type of [`useOptionalService`](#useoptionalservice)                                             |
| `ServiceHook<K>`              | The overloads of the [service hooks](#service-hooks); `K` is `'service'`, `'optional'` or `'suspense'` |
| `ServiceHookResults<T>`       | What each service hook returns for an instance of type `T`, by `K`                                     |
