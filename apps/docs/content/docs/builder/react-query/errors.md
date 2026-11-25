---
title: Errors
---

# Errors

Hooks call the throwing form of an endpoint, so every failure reaches TanStack Query's error channel as the endpoint's `EndpointError`. This page shows the places that error turns up in React and how to branch on it there. What the kinds mean, and how `errorSchema` gives error bodies a type, is on Builder's [Errors](/docs/builder/essentials/errors) page.

## In a hook result

`error` on a query or mutation result is already typed for its endpoint. Narrow on `kind`, then `status`, as you would on the result of `.safe()`.

```tsx
// userQuery from the React Query quick start
function UserCard({ userId }: { userId: string }) {
  const { data: user, error, isPending, refetch } = userQuery.use({ urlParams: { userId } })

  if (isPending) return <p>Loading…</p>

  if (error) {
    if (error.kind === 'http-unknown' && error.status === 404) return <p>No such user.</p>
    if (error.kind === 'network' || error.kind === 'timeout') {
      return <button onClick={() => refetch()}>Connection lost. Retry</button>
    }
    return <p>Something went wrong.</p>
  }

  return <h2>{user.name}</h2>
}
```

When the endpoint declares an `errorSchema`, the `http` kind carries the typed body. `createUser` as declared on Builder's Errors page describes its 409 reply:

```tsx
// client from the React Query quick start
export const useCreateUser = client.mutation(createUser)

function CreateUserError() {
  const { error } = useCreateUser()

  if (error?.kind === 'http' && error.status === 409) {
    return <p>{error.body.message}</p> // typed from errorSchema[409]
  }
  return null
}
```

A `withResponse: true` query or mutation changes only the success value. Failures are not wrapped.

## In mutation callbacks

`onError` in the mutation settings receives the same typed error, and `onSettled` receives it or `null`.

```ts
export const useCreateUser = client.mutation(createUser, {
  onError: (error, variables) => {
    if (error.kind === 'http' && error.status === 409) {
      showToast(`${variables.data.email} is taken by ${error.body.conflictWith}`)
    }
  },
})
```

`mutateAsync` rejects with the error. In the `catch` block it is `unknown`, so use the [guards](#when-the-error-is-unknown) below, or prefer `mutate` and read `error` from the hook.

## Error boundaries

`useSuspense` throws the error to the nearest error boundary, and so does `use` with TanStack's `throwOnError` option. A boundary receives `unknown`.

```tsx
import { isEndpointError, isHttpError } from '@navios/builder'

function UserErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  if (isHttpError(error, 409)) return <p>That user already exists.</p>
  if (isEndpointError(error) && error.status === 404) return <p>No such user.</p>

  const offline = isEndpointError(error) && error.kind === 'network'

  return (
    <>
      <p>{offline ? 'You are offline.' : 'Something went wrong.'}</p>
      <button onClick={resetErrorBoundary}>Try again</button>
    </>
  )
}
```

`FallbackProps` here is from `react-error-boundary`; any boundary works. To make "Try again" refetch, wrap the boundary in TanStack's [`QueryErrorResetBoundary`](https://tanstack.com/query/latest/docs/framework/react/reference/QueryErrorResetBoundary).

## When the error is unknown

Outside a hook result and a mutation callback, TypeScript no longer knows which endpoint failed. Two guards from `@navios/builder` get you back to a typed value:

- `isEndpointError(error)` narrows to `EndpointError`, after which `error.kind` and `error.status` work.
- `isHttpError(error, status?)` narrows to the `http` kind, meaning a status the endpoint declared in `errorSchema`. A status without a schema is `http-unknown` and does not match; test `error.status` after `isEndpointError` for those, as the 404 above does.

To name an endpoint's error type, for a prop or a helper, use `EndpointErrorType`:

```tsx
import type { EndpointErrorType } from '@navios/builder'

function ErrorMessage({ error }: { error: EndpointErrorType<typeof createUser> }) {
  // ...
}
```

## Retries

TanStack retries a failed query three times by default, and it does not know that some failures cannot succeed on a second attempt. Decide by `kind` once, on the `QueryClient`:

```ts
import { isEndpointError } from '@navios/builder'
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (failureCount >= 2 || !isEndpointError(error)) return false
        if (error.kind === 'network' || error.kind === 'timeout') return true
        // http and http-unknown: retry only when the server failed
        return error.kind.startsWith('http') && (error.status ?? 0) >= 500
      },
    },
  },
})
```

Without this, a 404 or a `request-validation` error, where nothing was sent at all, sits in the loading state through three pointless retries before it reaches `error`.

## Reporting

For logging and telemetry, register `onError` on the builder. It sees every failed call, from hooks or not, once per attempt. See [Reporting with onError](/docs/builder/essentials/errors) on the Builder page.

Related: [Forms](/docs/builder/react-query/recipes/forms) maps validation errors to fields.
