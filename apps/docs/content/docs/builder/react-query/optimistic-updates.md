---
title: Optimistic updates
---

# Optimistic updates

An optimistic update writes the expected result to the cache before the request is sent, so the UI changes at once. The `optimistic` setting of a [mutation](/docs/builder/react-query/mutations) describes the change; cancelling fetches, rolling back on failure and refetching afterwards are done for you.

## One cache entry

`optimistic` receives an `update` function. Call it with the query to change and two functions: `args` picks the cache entry from the mutation's variables, `update` computes its new value.

```ts
// client and userQuery from the React Query quick start; updateUser from "URL params, query and body"
export const useUpdateUser = client.mutation(updateUser, {
  optimistic: (update) =>
    update(userQuery, {
      args: (variables) => ({ urlParams: variables.urlParams }),
      update: (current, variables) => current && { ...current, ...variables.data },
    }),
})
```

Everything is typed: `variables` from the mutation's endpoint, `current` from the query's data, and the return value of `args` against the query's arguments.

`current` is `undefined` when nothing is cached for the entry. `current && { ... }` leaves such an entry empty; returning `current` unchanged skips the update.

`args` is required when the query has required arguments, as `userQuery` does, so an update cannot land on no entry by mistake. For a query that requires nothing it is optional, and leaving it out targets the entry without arguments.

## What happens

When `mutate` is called, for each update:

1. Fetches of the entry that are in flight are cancelled, so a late response cannot overwrite the optimistic value. Only that entry: other entries of the endpoint keep loading.
2. The entry is replaced with `update(current, variables)`.
3. Your own `onMutate` runs, then the request is sent.
4. If the mutation fails, the update is undone.
5. When the mutation settles, the entry, and no other, is invalidated so the server's state replaces the guess.

Rollback is tracked per cache entry, not per mutation. When two mutations are pending on one entry and the first fails, only its change is removed: the entry is rebuilt from the last real value plus the update that is still pending.

:::warning
`update` can run more than once for one mutation, because that rebuild re-applies it. Keep it a pure function of `current` and `variables`: no `Date.now()`, no random IDs generated inside it.
:::

## Several entries

Return an array to change more than one entry. A typical edit updates the detail entry and the list:

```ts
// usersQuery from Queries
export const useUpdateUser = client.mutation(updateUser, {
  optimistic: (update) => [
    update(userQuery, {
      args: (variables) => ({ urlParams: variables.urlParams }),
      update: (current, variables) => current && { ...current, ...variables.data },
    }),
    update(usersQuery, {
      update: (current, variables) =>
        current?.map((user) =>
          user.id === String(variables.urlParams.userId) ? { ...user, ...variables.data } : user,
        ),
    }),
  ],
})
```

URL parameter values are typed `string | number` unless the endpoint has a `urlParamsSchema`, hence the `String(...)` when comparing with an ID.

The second update has no `args`, so it changes the list entry that was fetched without arguments. A list cached under `{ params: { role: 'admin' } }` is a different entry; add an update with matching `args` for each one you show, or let [`invalidates`](/docs/builder/react-query/mutations#invalidating-queries) refresh the rest after success.

## Adding and removing items

The same shape covers lists that grow or shrink.

```ts
// deleteUser from "Declaring endpoints"
export const useDeleteUser = client.mutation(deleteUser, {
  optimistic: (update) =>
    update(usersQuery, {
      update: (current, variables) =>
        current?.filter((user) => user.id !== String(variables.urlParams.userId)),
    }),
})
```

When adding, the real ID is not known yet. Derive a placeholder from the variables rather than generating one, so `update` stays pure; the refetch on settle replaces it with the server's item.

```ts
// createUser from the Builder quick start
export const useCreateUser = client.mutation(createUser, {
  optimistic: (update) =>
    update(usersQuery, {
      update: (current, variables) => [
        ...(current ?? []),
        { id: `pending:${variables.data.email}`, ...variables.data },
      ],
    }),
})
```

## Rollback and settle flags

Each update takes two flags, both `true` by default:

| Flag | When `false` |
| --- | --- |
| `rollbackOnError` | A failed mutation leaves the optimistic value in the cache. |
| `invalidateOnSettled` | The entry is not refetched when the mutation settles. |

Turn off `invalidateOnSettled` when the optimistic value is exactly what the server stores and a refetch would be wasted:

```ts
optimistic: (update) =>
  update(userQuery, {
    args: (variables) => ({ urlParams: variables.urlParams }),
    update: (current, variables) => current && { ...current, ...variables.data },
    invalidateOnSettled: false,
  }),
```

## With other settings

`optimistic` combines with `invalidates` and the callbacks. A common pairing is an `onError` that tells the user the change was reverted:

```ts
export const useUpdateUser = client.mutation(updateUser, {
  optimistic: (update) => update(userQuery, { /* as above */ }),
  invalidates: [usersQuery],
  onError: (error) => {
    showToast(`Could not save: ${error.message}`)
  },
})
```

For a flow the setting does not fit, do it by hand in `onMutate` with `context.client` and the query's `getData` / `setData`, following TanStack's [optimistic updates guide](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates).
