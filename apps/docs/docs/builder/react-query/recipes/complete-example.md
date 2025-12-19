---
sidebar_position: 1
---

# Complete Example

A complete CRUD example showing queries, mutations, optimistic updates, and error handling.

## Setup

```typescript
// api/index.ts
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { declareClient } from '@navios/react-query'

const api = builder()
api.provideClient(create({ baseURL: 'https://api.example.com' }))

export const client = declareClient({ api })
```

## Schemas

```typescript
// api/schemas/user.ts
import { z } from 'zod'

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
})

export type User = z.output<typeof userSchema>
```

## Queries

```typescript
// api/queries/users.ts
import { client } from '../index'
import { userSchema } from '../schemas/user'
import { z } from 'zod'

export const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  processResponse: (data) => data,
})

export const getUsers = client.query({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().optional(),
    limit: z.number().optional(),
  }),
  responseSchema: z.object({
    users: z.array(userSchema),
    total: z.number(),
  }),
  processResponse: (data) => data,
})
```

## Mutations

```typescript
// api/mutations/users.ts
import { client } from '../index'
import { userSchema } from '../schemas/user'
import { getUser, getUsers } from '../queries/users'
import { useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

export const createUser = client.mutation({
  method: 'POST',
  url: '/users',
  requestSchema: userSchema.omit({ id: true, createdAt: true }),
  responseSchema: userSchema,
  processResponse: (data) => data,
  useContext: () => ({ queryClient: useQueryClient() }),
  onSuccess: (data, variables, context) => {
    context.queryClient.invalidateQueries({
      queryKey: getUsers.queryKey.filterKey({}),
    })
  },
})

export const updateUser = client.mutation({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: userSchema.partial().omit({ id: true, createdAt: true }),
  responseSchema: userSchema,
  processResponse: (data) => data,
  useContext: () => ({ queryClient: useQueryClient() }),
  useKey: true,
  onMutate: async (variables, context) => {
    await context.queryClient.cancelQueries({
      queryKey: getUser.queryKey.filterKey({
        urlParams: { userId: variables.urlParams.userId },
      }),
    })

    const previous = context.queryClient.getQueryData(
      getUser.queryKey.dataTag({
        urlParams: { userId: variables.urlParams.userId },
      })
    )

    context.queryClient.setQueryData(
      getUser.queryKey.dataTag({
        urlParams: { userId: variables.urlParams.userId },
      }),
      { ...previous, ...variables.data }
    )

    return { previous }
  },
  onError: (error, variables, context) => {
    if (context.onMutateResult?.previous) {
      context.queryClient.setQueryData(
        getUser.queryKey.dataTag({
          urlParams: { userId: variables.urlParams.userId },
        }),
        context.onMutateResult.previous
      )
    }
  },
  onSuccess: (data, variables, context) => {
    context.queryClient.setQueryData(
      getUser.queryKey.dataTag({
        urlParams: { userId: data.id },
      }),
      data
    )
  },
})

export const deleteUser = client.mutation({
  method: 'DELETE',
  url: '/users/$userId',
  responseSchema: z.object({ success: z.boolean() }),
  processResponse: (data) => data,
  useContext: () => ({ queryClient: useQueryClient() }),
  onSuccess: (data, variables, context) => {
    context.queryClient.removeQueries({
      queryKey: getUser.queryKey.filterKey({
        urlParams: { userId: variables.urlParams.userId },
      }),
    })
    context.queryClient.invalidateQueries({
      queryKey: getUsers.queryKey.filterKey({}),
    })
  },
})
```

## Components

```typescript
// components/UserList.tsx
import { Suspense } from 'react'
import { getUsers } from '../api/queries/users'
import { UserCard } from './UserCard'

function UserListContent() {
  const { users, total } = getUsers.useSuspense({ params: { page: 1, limit: 10 } })

  return (
    <div>
      <h1>Users ({total})</h1>
      <div>
        {users.map((user) => (
          <UserCard key={user.id} user={user} />
        ))}
      </div>
    </div>
  )
}

export function UserList() {
  return (
    <Suspense fallback={<div>Loading users...</div>}>
      <UserListContent />
    </Suspense>
  )
}
```

```typescript
// components/UserCard.tsx
import { updateUser, deleteUser } from '../api/mutations/users'

export function UserCard({ user }: { user: User }) {
  const { mutate: updateUserMutate, isPending: isUpdating } = updateUser({
    urlParams: { userId: user.id },
  })
  const isUpdatingItem = updateUser.useIsMutating({ userId: user.id })
  const { mutate: deleteUserMutate, isPending: isDeleting } = deleteUser()

  const handleUpdate = () => {
    updateUserMutate({
      data: { name: 'Updated Name' },
    })
  }

  const handleDelete = () => {
    if (confirm('Delete this user?')) {
      deleteUserMutate({
        urlParams: { userId: user.id },
      })
    }
  }

  return (
    <div>
      <h2>{user.name}</h2>
      <p>{user.email}</p>
      <button onClick={handleUpdate} disabled={isUpdating || isUpdatingItem}>
        {isUpdatingItem ? 'Saving...' : 'Update'}
      </button>
      <button onClick={handleDelete} disabled={isDeleting}>
        {isDeleting ? 'Deleting...' : 'Delete'}
      </button>
    </div>
  )
}
```

```typescript
// components/UserProfile.tsx
import { Suspense } from 'react'
import { getUser } from '../api/queries/users'
import { UserForm } from './UserForm'

function UserProfileContent({ userId }: { userId: string }) {
  const user = getUser.useSuspense({ urlParams: { userId } })

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
      <UserForm user={user} />
    </div>
  )
}

export function UserProfile({ userId }: { userId: string }) {
  return (
    <Suspense fallback={<div>Loading profile...</div>}>
      <UserProfileContent userId={userId} />
    </Suspense>
  )
}
```

```typescript
// components/CreateUserForm.tsx
import { createUser } from '../api/mutations/users'

export function CreateUserForm() {
  const { mutate, isPending } = createUser()

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
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create User'}
      </button>
    </form>
  )
}
```

## App Setup

```typescript
// App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UserList } from './components/UserList'
import { CreateUserForm } from './components/CreateUserForm'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CreateUserForm />
      <UserList />
    </QueryClientProvider>
  )
}
```

## Next Steps

- [Form Handling](/docs/builder/react-query/recipes/form-handling) - More form patterns
- [Real-time Updates](/docs/builder/react-query/recipes/realtime-updates) - Polling and refetching

