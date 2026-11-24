# Form Handling

Patterns for submitting forms with mutations and showing validation errors.

The examples use this mutation:

```typescript
const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
})

const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: createUserSchema,
  responseSchema: userSchema,
  errorSchema: {
    409: z.object({ reason: z.string() }),
    422: z.object({ fields: z.record(z.string(), z.string()) }),
  },
  invalidates: [listUsers],
})
```

## Basic Form

```typescript
function CreateUserForm() {
  const { mutate, isPending, error } = createUser()

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    mutate({
      data: {
        name: String(form.get('name') ?? ''),
        email: String(form.get('email') ?? ''),
      },
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" />
      <input name="email" type="email" />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create User'}
      </button>
      {error && <div>Error: {error.message}</div>}
    </form>
  )
}
```

## Controlled Form

```typescript
import { useState } from 'react'

function CreateUserForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const { mutate, isPending } = createUser()

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    mutate(
      { data: { name, email } },
      {
        onSuccess: () => {
          setName('')
          setEmail('')
        },
      },
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={name} onChange={(event) => setName(event.target.value)} />
      <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      <button type="submit" disabled={isPending}>
        Create User
      </button>
    </form>
  )
}
```

## Showing Validation Errors

Two kinds of validation failure arrive through the same `error`:

- `request-validation` — the input failed `requestSchema`; nothing was sent. `error.issues` are the schema's issues.
- `http` with a status from `errorSchema` — the server rejected the input. `error.body` is typed from the schema.

```typescript
function fieldErrorsOf(
  error: ReturnType<typeof createUser>['error'],
): Record<string, string> {
  if (!error) return {}
  if (error.kind === 'request-validation') {
    return Object.fromEntries(
      error.issues.map((issue) => [issue.path?.join('.') ?? '', issue.message]),
    )
  }
  if (error.kind === 'http' && error.status === 422) return error.body.fields
  return {}
}

function CreateUserForm() {
  const { mutate, isPending, error } = createUser()
  const fieldErrors = fieldErrorsOf(error)

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    mutate({
      data: {
        name: String(form.get('name') ?? ''),
        email: String(form.get('email') ?? ''),
      },
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <input name="name" />
        {fieldErrors.name && <span>{fieldErrors.name}</span>}
      </div>
      <div>
        <input name="email" type="email" />
        {fieldErrors.email && <span>{fieldErrors.email}</span>}
      </div>
      {error?.kind === 'http' && error.status === 409 && <div>{error.body.reason}</div>}
      <button type="submit" disabled={isPending}>
        Create User
      </button>
    </form>
  )
}
```

:::tip
To validate before submitting — on blur, or with a form library — run the same schema yourself: `createUserSchema.safeParse(values)`.
:::

## Success Handling

Put what always follows a success in the declaration, and what belongs to one form at the call site:

```typescript
const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: createUserSchema,
  responseSchema: userSchema,
  useContext: () => ({ navigate: useNavigate() }),
  invalidates: [listUsers],
  onSuccess: (user, _variables, context) => {
    context.navigate(`/users/${user.id}`)
  },
})

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const { mutate } = createUser()

  const submit = (data: z.input<typeof createUserSchema>) => {
    mutate({ data }, { onSuccess: onCreated })
  }

  // ...
}
```

## Edit Form

Load the current values with a query and save with a mutation:

```typescript
const updateUser = client.mutation({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: z.object({ name: z.string().min(1) }),
  responseSchema: userSchema,
  invalidates: [listUsers],
  onSuccess: (user, variables, context) => {
    getUser.setData(context.client, { urlParams: variables.urlParams }, user)
  },
})

function EditUserForm({ userId }: { userId: string }) {
  const { data: user } = getUser.useSuspense({ urlParams: { userId } })
  const { mutate, isPending } = updateUser()

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    mutate({ urlParams: { userId }, data: { name: String(form.get('name') ?? '') } })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" defaultValue={user.name} />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Saving...' : 'Save'}
      </button>
    </form>
  )
}
```

## Next Steps

- [Mutations](/docs/builder/react-query/guides/mutations) - Mutation settings
- [Typed Errors](/docs/builder/react-query/advanced/error-schemas) - Every error kind
- [Optimistic Updates](/docs/builder/react-query/guides/optimistic-updates) - Update UI optimistically
