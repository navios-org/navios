# Best Practices

Recommended patterns for using `@navios/react-query`.

## Organizing Queries and Mutations

### Separate Endpoints from Queries

Declare endpoints in a shared location when they are also used outside React (server code, scripts, tests), and create queries from them in the client:

```typescript
// shared/endpoints/users.ts
export const getUserEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

// client/queries/users.ts
export const getUser = client.query(getUserEndpoint)
```

When an endpoint is used only through React Query, the inline form is shorter and `getUser.endpoint` still gives you the handler.

### Group by Resource

```typescript
// client/users.ts
export const getUser = client.query(getUserEndpoint)
export const listUsers = client.query(listUsersEndpoint)

export const createUser = client.mutation(createUserEndpoint, {
  invalidates: [listUsers],
})
export const updateUser = client.mutation(updateUserEndpoint, {
  invalidates: [listUsers, (_data, v) => getUser.key({ urlParams: v.urlParams })],
})
```

Declare queries before the mutations that reference them.

## Query Patterns

### Use Suspense When Possible

```typescript
// Good - data is always defined
function UserProfile({ userId }: { userId: string }) {
  const { data } = getUser.useSuspense({ urlParams: { userId } })
  return <div>{data.name}</div>
}

// More verbose - manual loading and error states
function UserProfile({ userId }: { userId: string }) {
  const { data, isPending, error } = getUser.use({ urlParams: { userId } })
  if (isPending) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  return <div>{data.name}</div>
}
```

### Use `select` for Read-Side Projections

Keep the cached value as the server returned it and derive what a component needs:

```typescript
const { data: names } = listUsers.use(
  {},
  { select: (users) => users.map((user) => user.name) },
)
```

### Use `skipToken` for Missing Inputs

```typescript
import { skipToken } from '@tanstack/react-query'

// Good - no placeholder arguments
const { data } = getUser.use(userId ? { urlParams: { userId } } : skipToken)

// Avoid - a fake key for a request that must never happen
const { data } = getUser.use({ urlParams: { userId: userId ?? '' } }, { enabled: !!userId })
```

## Mutation Patterns

### Declare What a Mutation Invalidates

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: createUserSchema,
  responseSchema: userSchema,
  invalidates: [listUsers],
})
```

### Use `optimistic` for Instant Feedback

```typescript
const toggleTodo = client.mutation({
  method: 'PATCH',
  url: '/todos/$todoId',
  requestSchema: z.object({ done: z.boolean() }),
  responseSchema: todoSchema,
  optimistic: (update) =>
    update(getTodo, {
      args: (variables) => ({ urlParams: variables.urlParams }),
      update: (current, variables) => current && { ...current, ...variables.data },
    }),
})
```

### Use `context.client` in Callbacks

The `QueryClient` is part of the callback context; `useContext` is for other hooks:

```typescript
const updateUser = client.mutation(updateUserEndpoint, {
  useContext: () => ({ toast: useToast() }),
  onSuccess: (user, variables, context) => {
    getUser.setData(context.client, { urlParams: variables.urlParams }, user)
    context.toast.success('Saved')
  },
})
```

### Track List Items with `useIsMutating`

```typescript
function UserRow({ user }: { user: User }) {
  const { mutate } = updateUser()
  const isSaving = updateUser.useIsMutating({ urlParams: { userId: user.id } })
  // ...
}
```

## Query Key Management

### Never Write Keys by Hand

```typescript
// Good
await getUser.invalidate(queryClient, { urlParams: { userId } })
queryClient.removeQueries({ queryKey: getUser.key({ urlParams: { userId } }) })

// Bad - matches nothing
await queryClient.invalidateQueries({ queryKey: ['users', userId] })
```

### Pick the Narrowest Correct Scope

```typescript
await getUser.invalidate(queryClient) // every user
await getUser.invalidate(queryClient, { urlParams: { userId } }) // this user
await getUser.invalidate(queryClient, { urlParams: { userId } }, { exact: true }) // one entry
```

## Error Handling

### Declare Error Schemas for What the UI Handles

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: createUserSchema,
  responseSchema: userSchema,
  errorSchema: {
    409: z.object({ reason: z.string() }),
  },
})

const { error } = createUser()

const message =
  error?.kind === 'http' && error.status === 409
    ? error.body.reason
    : error
      ? 'Something went wrong'
      : null
```

### Use Error Boundaries with Suspense

```typescript
<ErrorBoundary FallbackComponent={ErrorFallback}>
  <Suspense fallback={<Loading />}>
    <UserProfile userId={userId} />
  </Suspense>
</ErrorBoundary>
```

### Report Globally, React Locally

Log every failure once in the builder's `onError`; show feedback in components:

```typescript
const api = builder({
  client: httpClient,
  onError: (error) => reportError(error.toJSON()),
})
```

## Performance

### Set a Stale Time

```typescript
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
})

// Or per call
getUser.use({ urlParams: { userId } }, { staleTime: 5 * 60_000 })
```

### Prefetch

```typescript
// Server
await getUser.prefetch(queryClient, { urlParams: { userId } })

// Client, on hover
onMouseEnter={() => void getUser.prefetch(queryClient, { urlParams: { userId } })}
```

## Type Safety

### Let TypeScript Infer Types

```typescript
// Good - types are inferred from the endpoint
const { data, error } = getUser.use({ urlParams: { userId } })

// Avoid - annotations that can drift from the schema
const result: UseQueryResult<User> = getUser.use({ urlParams: { userId } })
```

### Derive Types from Schemas and Endpoints

```typescript
import type { EndpointErrorType } from '@navios/builder'

type User = z.output<typeof userSchema>
type GetUserError = EndpointErrorType<typeof getUser.endpoint>
```

## Next Steps

- [Queries](/docs/builder/react-query/guides/queries) - Query usage
- [Mutations](/docs/builder/react-query/guides/mutations) - Mutation usage
- [Query Keys](/docs/builder/react-query/guides/query-keys) - Key structure and scopes
- [Typed Errors](/docs/builder/react-query/advanced/error-schemas) - Error handling
