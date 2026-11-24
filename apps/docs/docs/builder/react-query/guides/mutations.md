---
sidebar_position: 3
---

# Mutations

Mutations create, update or delete data. `client.mutation` returns a hook: call it without arguments inside a component to get TanStack's mutation result.

## Basic Mutation

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  responseSchema: userSchema,
})

function CreateUserForm() {
  const { mutate, isPending, error } = createUser()

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    mutate({
      data: {
        name: String(form.get('name')),
        email: String(form.get('email')),
      },
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" />
      <input name="email" />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create'}
      </button>
      {error && <div>Error: {error.message}</div>}
    </form>
  )
}
```

## Mutation from an Existing Endpoint

Pass the handler first and the settings second:

```typescript
// shared/endpoints/users.ts
export const createUserEndpoint = api.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: createUserSchema,
  responseSchema: userSchema,
})

// client/mutations/users.ts
const createUser = client.mutation(createUserEndpoint, {
  invalidates: [listUsers],
})
```

## Variables

The variables passed to `mutate` are the endpoint's call arguments: `urlParams`, `params`, `data`, plus per-call `headers` and `timeout`.

```typescript
const updateUser = client.mutation({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: z.object({ name: z.string() }),
  responseSchema: userSchema,
})

const { mutate } = updateUser()
mutate({ urlParams: { userId }, data: { name: 'Ada' } })
```

When the endpoint requires nothing, `mutate()` takes no variables:

```typescript
const logout = client.mutation({ method: 'POST', url: '/logout', response: 'void' })

const { mutate } = logout()
mutate()
```

`response: 'void'` declares an endpoint without a response body (for example a 204), so no `responseSchema` is needed:

```typescript
const deleteUser = client.mutation({
  method: 'DELETE',
  url: '/users/$userId',
  response: 'void',
})
```

## Settings

`client.mutation` accepts every TanStack mutation option (`retry`, `scope`, `meta`, `gcTime`, `networkMode`, ...) except `mutationKey` and `mutationFn`, plus the settings below.

### invalidates

Queries to invalidate after the mutation succeeds. An entry is either a query object (every cache entry of that endpoint) or a function that returns a key from the mutation's result and variables:

```typescript
const updateUser = client.mutation({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: z.object({ name: z.string() }),
  responseSchema: userSchema,
  invalidates: [
    listUsers,
    (_data, variables) => getUser.key({ urlParams: variables.urlParams }),
  ],
})
```

Return `undefined` from a function to skip it. Nothing is invalidated when the mutation fails. The mutation stays pending until the invalidated queries have refetched.

### optimistic

Cache updates applied before the request is sent, rolled back if the mutation fails:

```typescript
const updateUser = client.mutation({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: z.object({ name: z.string() }),
  responseSchema: userSchema,
  optimistic: (update) =>
    update(getUser, {
      args: (variables) => ({ urlParams: variables.urlParams }),
      update: (current, variables) => current && { ...current, ...variables.data },
    }),
})
```

`args` is required when the target query has required inputs, as `getUser` does with its `userId`. See [Optimistic Updates](/docs/builder/react-query/guides/optimistic-updates).

### withResponse

Delivers the status and headers of the reply together with the data — for a `Location` header after a create, or to tell a `200` from a `201`:

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({ name: z.string() }),
  responseSchema: userSchema,
  withResponse: true,
  onSuccess: (result) => {
    result.data // User
    result.response.status // 201
    result.response.headers.location // '/users/1'
  },
})

const { mutateAsync } = createUser()
const { data: user, response } = await mutateAsync({ data: { name: 'Ada' } })
```

The mutation's data is `{ data, response: { status, statusText, headers } }` wherever it appears: the hook result, `mutateAsync`, `onSuccess`, `onSettled` and the functions in `invalidates`. `headers` is a plain record with lower-cased names. A failure is still the endpoint's `EndpointError` in `error` and `onError`.

With an existing endpoint, pass it with the other settings: `client.mutation(createUserEndpoint, { withResponse: true })`.

It pairs well with per-status [`responses`](/docs/builder/builder/guides/defining-endpoints#per-status-responses): `result.response.status` says which of the declared bodies `result.data` is.

### Callbacks

`onMutate`, `onSuccess`, `onError` and `onSettled` receive a context object as their last argument. It contains TanStack's `client` (the `QueryClient`), `meta` and `mutationKey`, merged with whatever `useContext` returns:

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: createUserSchema,
  responseSchema: userSchema,
  useContext: () => ({ navigate: useNavigate() }),
  onSuccess: (user, variables, context) => {
    getUser.setData(context.client, { urlParams: { userId: user.id } }, user)
    context.navigate(`/users/${user.id}`)
  },
  onError: (error, variables, context) => {
    console.error('Failed to create user', error)
  },
})
```

| Callback    | Signature                                    | Runs                         |
| ----------- | -------------------------------------------- | ---------------------------- |
| `onMutate`  | `(variables, context)`                       | Before the request is sent   |
| `onSuccess` | `(data, variables, context)`                 | After a successful response  |
| `onError`   | `(error, variables, context)`                | After a failure              |
| `onSettled` | `(data, error, variables, context)`          | After either                 |

See [Context in Mutations](/docs/builder/react-query/guides/mutation-context).

## Mutation States

```typescript
const { mutate, mutateAsync, isPending, isError, isSuccess, error, data, reset } =
  createUser()
```

`mutate` fires and reports through the hook state and callbacks. `mutateAsync` returns a promise that rejects with the `EndpointError`:

```typescript
const { mutateAsync } = createUser()

const handleSubmit = async () => {
  try {
    const user = await mutateAsync({ data: { name: 'Ada', email: 'ada@example.com' } })
    console.log('Created', user.id)
  } catch (error) {
    // error is the endpoint's EndpointError
  }
}
```

## Error Handling

`error` on the hook result and the `error` argument of `onError` are the endpoint's `EndpointError`, typed from its `errorSchema`:

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: createUserSchema,
  responseSchema: userSchema,
  errorSchema: {
    409: z.object({ reason: z.string() }),
    422: z.object({ fields: z.record(z.string(), z.string()) }),
  },
})

function CreateUserForm() {
  const { mutate, error } = createUser()

  let message: string | null = null
  if (error) {
    if (error.kind === 'http' && error.status === 409) {
      message = error.body.reason // typed from errorSchema[409]
    } else if (error.kind === 'http' && error.status === 422) {
      message = Object.values(error.body.fields).join(', ')
    } else if (error.kind === 'request-validation') {
      message = 'Please check the form'
    } else {
      message = 'Something went wrong'
    }
  }

  // ...
}
```

See [Typed Errors](/docs/builder/react-query/advanced/error-schemas).

## Mutation Key and In-Flight State

Every mutation has a key shared by all mutations of its endpoint, and a hook that tells whether one is running:

```typescript
updateUser.mutationKey // ['PATCH', '/users/$userId']

const isSaving = updateUser.useIsMutating() // any user
const isSavingThis = updateUser.useIsMutating({ urlParams: { userId } }) // this user
```

See [Scoped Mutations](/docs/builder/react-query/guides/scoped-mutations).

## Next Steps

- [Scoped Mutations](/docs/builder/react-query/guides/scoped-mutations) - Per-item mutation state
- [File Uploads](/docs/builder/react-query/guides/file-uploads) - Multipart mutations
- [Optimistic Updates](/docs/builder/react-query/guides/optimistic-updates) - Update UI before the server responds
- [Context in Mutations](/docs/builder/react-query/guides/mutation-context) - What callbacks receive
- [Invalidation](/docs/builder/react-query/guides/invalidation) - Refresh queries after mutations
