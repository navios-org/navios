---
sidebar_position: 2
---

# Form Handling

Common patterns for handling forms with mutations.

## Basic Form

```typescript
import { createUser } from '../api/mutations/users'

export function CreateUserForm() {
  const { mutate, isPending, isError, error } = createUser()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    mutate({
      data: {
        name: formData.get('name') as string,
        email: formData.get('email') as string,
      },
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" placeholder="Name" required />
      <input name="email" type="email" placeholder="Email" required />
      {isError && (
        <div className="error">
          {error instanceof NaviosError ? error.message : 'An error occurred'}
        </div>
      )}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create User'}
      </button>
    </form>
  )
}
```

## Controlled Form

```typescript
import { useState } from 'react'
import { createUser } from '../api/mutations/users'

export function CreateUserForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const { mutate, isPending } = createUser()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutate({
      data: { name, email },
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        required
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        placeholder="Email"
        required
      />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create User'}
      </button>
    </form>
  )
}
```

## Form with Validation

```typescript
import { useState } from 'react'
import { createUser } from '../api/mutations/users'
import { z } from 'zod'

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
})

export function CreateUserForm() {
  const [formData, setFormData] = useState({ name: '', email: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { mutate, isPending } = createUser()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const result = formSchema.safeParse(formData)
    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message
        }
      })
      setErrors(fieldErrors)
      return
    }

    setErrors({})
    mutate({
      data: result.data,
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Name"
        />
        {errors.name && <span className="error">{errors.name}</span>}
      </div>
      <div>
        <input
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          type="email"
          placeholder="Email"
        />
        {errors.email && <span className="error">{errors.email}</span>}
      </div>
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create User'}
      </button>
    </form>
  )
}
```

## Form with Success Handling

```typescript
import { useState } from 'react'
import { createUser } from '../api/mutations/users'

export function CreateUserForm() {
  const [formData, setFormData] = useState({ name: '', email: '' })
  const { mutate, isPending, isSuccess } = createUser()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutate(
      { data: formData },
      {
        onSuccess: () => {
          setFormData({ name: '', email: '' })
        },
      }
    )
  }

  if (isSuccess) {
    return <div>User created successfully!</div>
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        placeholder="Name"
        required
      />
      <input
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        type="email"
        placeholder="Email"
        required
      />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create User'}
      </button>
    </form>
  )
}
```

## Edit Form

```typescript
import { updateUser } from '../api/mutations/users'

export function EditUserForm({ user }: { user: User }) {
  const [formData, setFormData] = useState({ name: user.name, email: user.email })
  const { mutate, isPending, isUpdating } = updateUser({
    urlParams: { userId: user.id },
  })
  const isUpdatingItem = updateUser.useIsMutating({ userId: user.id })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutate({ data: formData })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        placeholder="Name"
        required
      />
      <input
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        type="email"
        placeholder="Email"
        required
      />
      <button type="submit" disabled={isPending || isUpdating || isUpdatingItem}>
        {(isPending || isUpdating || isUpdatingItem) ? 'Saving...' : 'Save'}
      </button>
    </form>
  )
}
```

## Next Steps

- [Complete Example](/docs/builder/react-query/recipes/complete-example) - Full CRUD example
- [Mutations](/docs/builder/react-query/guides/mutations) - Learn about mutations

