---
title: Mutations
---

# Mutations

`client.mutation` turns an endpoint into a `useMutation` hook. On top of TanStack's options it adds three settings of its own: `invalidates`, `optimistic` and `useContext`. This page covers the hook, its callbacks and how to tell which mutations are running.

## The hook

The mutation is a hook. `mutate` and `mutateAsync` take the endpoint's arguments, URL parameters included.

```tsx
// client from the React Query quick start; updateUser from "URL params, query and body"
export const useUpdateUser = client.mutation(updateUser)

function RenameButton({ userId }: { userId: string }) {
  const { mutate, isPending, error } = useUpdateUser()

  return (
    <>
      <button
        disabled={isPending}
        onClick={() => mutate({ urlParams: { userId }, data: { name: 'Ada Lovelace' } })}
      >
        Rename
      </button>
      {error && <p>{error.message}</p>}
    </>
  )
}
```

The hook returns TanStack's [`useMutation` result](https://tanstack.com/query/latest/docs/framework/react/reference/useMutation). `data` is the endpoint's validated response and `error` its `EndpointError`. When the endpoint requires no arguments, `mutate()` can be called without any.

Any endpoint works, including ones without a response body (`response: 'void'`), uploads and downloads. See [Uploads and downloads](/docs/builder/react-query/uploads-and-downloads) for the last two.

### Options of one component

The hook takes options for the component that uses it, over those of the declaration:

```tsx
function RenameForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const { mutate } = useUpdateUser({
    onSuccess: () => onDone(),
    retry: 0,
  })
  // ...
}
```

| Option                                                              | Effect                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `onSuccess`, `onError`, `onSettled`                                 | Run after the declaration's callback of the same name, with the same arguments. `onSuccess` runs after `invalidates`, `onError` after optimistic updates were rolled back |
| `retry`, `retryDelay`, `networkMode`, `gcTime`, `meta`, `throwOnError` | Replace the declaration's value for this component            |

What the mutation is stays with the declaration: `onMutate`, `scope`, `invalidates`, `optimistic` and `useContext` are not hook options. A callback for a single call goes to `mutate(variables, { onSuccess })`, as in TanStack Query; unlike the hook's, it does not run when the component unmounted before the mutation finished.

## Settings

Settings go in the second argument, or beside the endpoint options in an inline declaration. Every `useMutation` option except `mutationKey` and `mutationFn` is accepted and passed through: `retry`, `scope`, `gcTime`, `meta`, `networkMode` and so on.

```ts
export const useUpdateUser = client.mutation(updateUser, {
  retry: 1,
  scope: { id: 'user-edits' }, // TanStack: mutations in one scope run one at a time
})
```

The settings this package adds or changes are described below. `optimistic` has [its own page](/docs/builder/react-query/optimistic-updates).

## Invalidating queries

`invalidates` lists what to refetch after the mutation succeeds. Each item is a query, meaning every cache entry of that endpoint in every form (its [`endpointKey`](/docs/builder/react-query/keys-and-invalidation#three-scopes)), or a function that returns one key. A single item does not need the array: `invalidates: usersQuery`.

```ts
// userQuery from the React Query quick start; usersQuery from Queries
export const useUpdateUser = client.mutation(updateUser, {
  invalidates: [
    usersQuery,
    (user, variables) => userQuery.key({ urlParams: variables.urlParams }),
  ],
})
```

The function receives the mutation's data and variables. Return `undefined` from it to skip. The invalidations are awaited together with your `onSuccess`, so the mutation stays pending until the refetches of mounted queries have finished.

## Callbacks and their context

`onMutate`, `onSuccess`, `onError` and `onSettled` run for every call of the mutation. Their last argument is a context object that already holds TanStack's `client` (the `QueryClient`), `meta` and `mutationKey`, so writing to the cache needs no extra hook:

```ts
export const useUpdateUser = client.mutation(updateUser, {
  onSuccess: (user, variables, context) => {
    userQuery.setData(context.client, { urlParams: variables.urlParams }, user)
  },
})
```

| Callback | Arguments |
| --- | --- |
| `onMutate` | `(variables, context)`; its return value becomes `onMutateResult` |
| `onSuccess` | `(data, variables, context)` |
| `onError` | `(error, variables, context)` |
| `onSettled` | `(data, error, variables, context)` |

In the last three, `context.onMutateResult` is whatever `onMutate` returned, or `undefined` if it did not run to completion.

### Adding hooks with useContext

Callbacks are defined outside a component, so they cannot call hooks. `useContext` can: it runs inside the mutation hook on every render, and its return value is merged into the context of every callback.

```ts
import { useNavigate } from 'react-router'

// deleteUser from "Declaring endpoints"
export const useDeleteUser = client.mutation(deleteUser, {
  useContext: () => ({ navigate: useNavigate() }),
  invalidates: [usersQuery],
  onMutate: () => ({ startedAt: Date.now() }),
  onSuccess: (_data, _variables, context) => {
    context.navigate('/users')
  },
  onSettled: (_data, _error, _variables, context) => {
    console.log('took', Date.now() - (context.onMutateResult?.startedAt ?? 0), 'ms')
  },
})
```

TanStack's own fields win on a name clash, so do not return a property called `client`, `meta` or `mutationKey`.

Callbacks passed to `mutate(variables, { onSuccess })` at the call site still work and run after these. Put what must always follow the mutation in the settings, and what belongs to one screen at the call site.

## Status and headers

`withResponse: true` makes the mutation's data `{ data, response }`, in the hook result and in `onSuccess` / `onSettled`. It is the same option [queries have](/docs/builder/react-query/queries#status-and-headers).

```ts
export const useUpdateUser = client.mutation(updateUser, {
  withResponse: true,
  onSuccess: ({ data: user, response }) => {
    console.log(user.id, response.headers.etag)
  },
})
```

## Which mutations are running

Every use of a mutation shares one key, `[method, url]`, available as `mutationKey`. `useIsMutating` reports whether any call with that key is in flight, from any component:

```tsx
function UserRow({ userId }: { userId: string }) {
  const savingAny = useUpdateUser.useIsMutating()
  const savingThis = useUpdateUser.useIsMutating({ urlParams: { userId } })

  return <tr aria-busy={savingThis}>{/* ... */}</tr>
}
```

With `urlParams`, only calls whose variables have those URL parameter values count. You may pass a subset of the parameters; values are compared as strings, so `42` matches `'42'`.

`useUpdateUser.mutationKey` is `['PATCH', '/users/$userId']`. Pass it to TanStack's `useMutationState` or `queryClient.isMutating` for anything `useIsMutating` does not cover. `keyPrefix` and `keySuffix` apply to it as they do to [query keys](/docs/builder/react-query/keys-and-invalidation#prefix-and-suffix).

Related: [Optimistic updates](/docs/builder/react-query/optimistic-updates), [Forms](/docs/builder/react-query/recipes/forms).
