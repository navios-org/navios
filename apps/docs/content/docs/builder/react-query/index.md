---
title: Quick start
---

# React Query quick start

`@navios/react-query` turns an endpoint declaration into TanStack Query hooks. Arguments, data and errors keep the types the declaration gives them, and cache keys are built for you. This page continues from the [Builder quick start](/docs/builder/quick-start) and uses the `API`, `getUser` and `createUser` declared there.

## Install

```bash
npm install @navios/react-query@next @tanstack/react-query
```

`@tanstack/react-query` must be `^5.102.0` or newer. Your app also needs TanStack's `QueryClientProvider` around the components that use the hooks; see [TanStack's installation guide](https://tanstack.com/query/latest/docs/framework/react/quick-start) if it is not set up yet.

## Create a client

`declareClient` takes the builder and returns three factories: `query`, `infiniteQuery` and `mutation`. Create it once per builder.

```ts title="queries.ts"
import { declareClient } from '@navios/react-query'

import { API } from './api'
import { createUser, getUser } from './users'

export const client = declareClient({ api: API })

export const userQuery = client.query(getUser)
export const useCreateUser = client.mutation(createUser)
```

A query is an object with hooks and cache helpers attached. A mutation is itself a hook, which is why it is named like one.

The only other option is `defaults`, which adds segments to every cache key: see [Keys and invalidation](/docs/builder/react-query/keys-and-invalidation#prefix-and-suffix).

## Read with a query

`use` is `useQuery` for the endpoint. It takes the same arguments object as the endpoint function.

```tsx
import { userQuery } from './queries'

function UserCard({ userId }: { userId: string }) {
  const { data: user, isPending, error } = userQuery.use({ urlParams: { userId } })

  if (isPending) return <p>Loading…</p>
  if (error) return <p>{error.message}</p>

  return <h2>{user.name}</h2>
}
```

`user` has the output type of `userSchema`. `error` is the endpoint's `EndpointError`, the same value `getUser.safe()` would give you; [Errors](/docs/builder/react-query/errors) shows how to branch on it in a component.

## Write with a mutation

Calling the mutation hook returns TanStack's mutation result. `mutate` takes the endpoint's arguments.

```tsx
import { useCreateUser } from './queries'

function AddUserButton() {
  const { mutate, isPending } = useCreateUser()

  return (
    <button
      disabled={isPending}
      onClick={() => mutate({ data: { name: 'Ada', email: 'ada@example.com' } })}
    >
      Add Ada
    </button>
  )
}
```

To refresh queries after a mutation succeeds, list them in its `invalidates` setting. [Mutations](/docs/builder/react-query/mutations#invalidating-queries) covers it.

## Inline or existing endpoint

Each factory accepts an endpoint you already declared, as above, or the declaration itself:

```ts
// userSchema from the Builder quick start
export const userQuery = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

userQuery.endpoint // the endpoint function, created for you with API.declareEndpoint
```

The inline form takes every option [`declareEndpoint`](/docs/builder/essentials/endpoints) takes. Settings that belong to the hook sit beside them in the same object; with an existing endpoint they go in a second argument:

```ts
client.query({ method: 'GET', url: '/users/$userId', responseSchema: userSchema, withResponse: true })
client.query(getUser, { withResponse: true })
```

Pass an existing endpoint when the declaration is shared with a server or called outside React. Declare inline when hooks are its only consumer. The two produce the same query and the same cache key.

Related: [Queries](/docs/builder/react-query/queries), [Mutations](/docs/builder/react-query/mutations), [API reference](/docs/builder/reference/react-query).
