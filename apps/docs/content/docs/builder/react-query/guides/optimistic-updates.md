# Optimistic Updates

An optimistic update writes the expected result to the cache before the request is sent, so the UI responds immediately. If the mutation fails the previous value is restored; when it settles the entry is invalidated so the server's state wins.

## The `optimistic` Setting

`optimistic` receives an `update` function. Call it with a query and a description of the change:

```typescript
const updateUser = client.mutation({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: z.object({ name: z.string() }),
  responseSchema: userSchema,
  optimistic: (update) =>
    update(getUser, {
      // Which cache entry: the query's args, computed from the mutation's variables
      args: (variables) => ({ urlParams: variables.urlParams }),
      // The new cached value
      update: (current, variables) => current && { ...current, ...variables.data },
    }),
})
```

`variables` is typed from the mutation's endpoint, `current` from the query's data (`User | undefined`), and `args` must return valid arguments for the query.

`args` is required whenever the query has required inputs — URL params, or a `querySchema` / `requestSchema` with required fields. `getUser` needs a `userId`, so leaving `args` out is a type error; without it the update would land on the bare endpoint key, which is no entry at all. For a query that requires nothing (a list without required params), `args` is optional and the update targets the entry without inputs.

For each update, when `mutate` is called:

1. In-flight fetches of the entry are cancelled, so they cannot overwrite the optimistic value
2. The current value is saved
3. The entry is replaced with `update(current, variables)`
4. If the mutation fails, the saved value is restored
5. When the mutation settles, the entry is invalidated

Concurrent mutations keep their snapshots apart: a failure of one does not roll back another.

### Options

| Option                | Default  | Description                                                                 |
| --------------------- | -------- | --------------------------------------------------------------------------- |
| `args`                | —        | `(variables) => args` of the entry to update. Required when the query has required inputs; optional otherwise |
| `update`              | required | `(current, variables) => next`. Return `current` unchanged to skip          |
| `rollbackOnError`     | `true`   | Restore the previous value when the mutation fails                          |
| `invalidateOnSettled` | `true`   | Invalidate the entry when the mutation settles                              |

`current` is `undefined` when nothing is cached for the entry yet. `current && { ... }` leaves such an entry empty.

## Several Queries

Return an array to update more than one entry:

```typescript
const updateUser = client.mutation({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: z.object({ name: z.string() }),
  responseSchema: userSchema,
  optimistic: (update) => [
    update(getUser, {
      args: (variables) => ({ urlParams: variables.urlParams }),
      update: (current, variables) => current && { ...current, ...variables.data },
    }),
    update(listUsers, {
      update: (current, variables) =>
        current?.map((user) =>
          user.id === String(variables.urlParams.userId) ? { ...user, ...variables.data } : user,
        ),
    }),
  ],
})
```

## Lists

### Adding

```typescript
const createTodo = client.mutation({
  method: 'POST',
  url: '/todos',
  requestSchema: z.object({ title: z.string() }),
  responseSchema: todoSchema,
  optimistic: (update) =>
    update(listTodos, {
      update: (current, variables) => [
        ...(current ?? []),
        { id: `temp-${Date.now()}`, title: variables.data.title, done: false },
      ],
    }),
})
```

The temporary item is replaced by the server's when the list is refetched on settle.

### Removing

```typescript
const deleteTodo = client.mutation({
  method: 'DELETE',
  url: '/todos/$todoId',
  response: 'void',
  optimistic: (update) =>
    update(listTodos, {
      update: (current, variables) =>
        current?.filter((todo) => todo.id !== String(variables.urlParams.todoId)),
    }),
})
```

### Toggling

```typescript
const toggleTodo = client.mutation({
  method: 'PATCH',
  url: '/todos/$todoId',
  requestSchema: z.object({ done: z.boolean() }),
  responseSchema: todoSchema,
  optimistic: (update) =>
    update(listTodos, {
      update: (current, variables) =>
        current?.map((todo) =>
          todo.id === String(variables.urlParams.todoId)
            ? { ...todo, done: variables.data.done }
            : todo,
        ),
    }),
})
```

:::note
URL param values are typed `string | number`, so compare them with `String(...)` against string IDs.
:::

## Combining with Other Settings

`optimistic` runs before your own `onMutate`, and works alongside `invalidates` and the callbacks:

```typescript
const updateUser = client.mutation({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: z.object({ name: z.string() }),
  responseSchema: userSchema,
  useContext: () => ({ toast: useToast() }),
  optimistic: (update) =>
    update(getUser, {
      args: (variables) => ({ urlParams: variables.urlParams }),
      update: (current, variables) => current && { ...current, ...variables.data },
    }),
  invalidates: [listUsers],
  onError: (_error, _variables, context) => {
    context.toast.error('Could not save, your change was reverted')
  },
})
```

## Keeping the Optimistic Value

Turn off the refetch when the optimistic value is known to be final, or the rollback when a later sync will reconcile:

```typescript
optimistic: (update) =>
  update(getSettings, {
    update: (current, variables) => current && { ...current, ...variables.data },
    invalidateOnSettled: false,
  }),
```

## Manual Pattern

For flows the setting does not cover, write the steps yourself with `onMutate` and the callback context:

```typescript
const updateUser = client.mutation({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: z.object({ name: z.string() }),
  responseSchema: userSchema,
  onMutate: async (variables, context) => {
    const args = { urlParams: variables.urlParams }
    await context.client.cancelQueries({ queryKey: getUser.key(args) })
    const previous = getUser.getData(context.client, args)
    getUser.setData(context.client, args, (old) => old && { ...old, ...variables.data })
    return { previous }
  },
  onError: (_error, variables, context) => {
    if (context.onMutateResult?.previous) {
      getUser.setData(
        context.client,
        { urlParams: variables.urlParams },
        context.onMutateResult.previous,
      )
    }
  },
  onSettled: (_data, _error, variables, context) =>
    getUser.invalidate(context.client, { urlParams: variables.urlParams }),
})
```

## Next Steps

- [Mutations](/docs/builder/react-query/guides/mutations) - Mutation settings
- [Context in Mutations](/docs/builder/react-query/guides/mutation-context) - What callbacks receive
- [Invalidation](/docs/builder/react-query/guides/invalidation) - Refresh cached data
