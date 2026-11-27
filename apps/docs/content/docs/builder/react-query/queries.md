---
title: Queries
---

# Queries

`client.query` binds an endpoint to the cache. The result is one object you use three ways: as a hook, as a source of TanStack query options, and as a typed handle on the cached data. This page covers all three.

The examples use `userQuery` from the [quick start](/docs/builder/react-query/) and one more query:

```ts
// client from the React Query quick start; listUsers from "URL params, query and body"
export const usersQuery = client.query(listUsers)
```

## The hook

`use` takes the endpoint's arguments. They are optional when the endpoint requires none.

```tsx
const { data: user } = userQuery.use({ urlParams: { userId } })

const { data: users } = usersQuery.use()
const { data: admins } = usersQuery.use({ params: { role: 'admin' } })
```

The arguments are the cache identity: two components calling `use` with the same arguments share one entry and one request. `use` returns TanStack's [`useQuery` result](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery) unchanged.

## Options

The second argument accepts every `useQuery` option except `queryKey` and `queryFn`, which the query owns.

```tsx
const { data } = userQuery.use(
  { urlParams: { userId } },
  { staleTime: 60_000, enabled: isOpen, refetchOnWindowFocus: false },
)
```

`select` derives a value from the cached data and changes the type of `data` with it:

```tsx
const { data: name } = userQuery.use(
  { urlParams: { userId } },
  { select: (user) => user.name },
)
// name: string | undefined
```

### Options for every use

Options that belong to the endpoint rather than to one screen can be set where the query is declared. Every use of the query gets them: its hooks, the options its call returns, and `fetch`, `prefetch` and `ensure`. A call site still wins.

```ts
export const getReport = client.query({
  method: 'POST',
  url: '/reports/run',
  requestSchema: reportRequestSchema,
  responseSchema: reportSchema,
  staleTime: Infinity,
  gcTime: Infinity,
  refetchOnWindowFocus: false,
})

getReport.use({ data: request }) // staleTime: Infinity
getReport.use({ data: request }, { staleTime: 0 }) // the call site wins
```

With an endpoint declared on the builder, they are the second argument: `client.query(getReportEndpoint, { staleTime: Infinity })`. Callbacks among them are typed from the endpoint: `retry: (count, error) => error.kind === 'network'`.

Every `useQuery` option is accepted except `select`, `initialData` and `initialDataUpdatedAt`, which stay at the call site: `select` would change the data type of the query and of every helper, and initial data belongs to one set of arguments. `fetch`, `prefetch` and `ensure` run outside a component, so they use only the options that apply there, such as `staleTime`, `gcTime` and `retry`.

To set options for a whole group of queries instead, give them a common `keyPrefix` and use TanStack's `queryClient.setQueryDefaults(['reports'], { staleTime: Infinity })`.

## Waiting for an input

When an argument is not known yet, pass TanStack's `skipToken` in place of the arguments. The query stays idle and the arguments stay fully typed, with no placeholder values.

```tsx
import { skipToken } from '@tanstack/react-query'

function UserCard({ userId }: { userId: string | null }) {
  const { data } = userQuery.use(userId ? { urlParams: { userId } } : skipToken)
  // ...
}
```

## Suspense

`useSuspense` is `useSuspenseQuery` for the endpoint. The component suspends while loading and throws to the nearest error boundary on failure, so `data` is always defined.

```tsx
function UserName({ userId }: { userId: string }) {
  const { data: user } = userQuery.useSuspense({ urlParams: { userId } })

  return <h2>{user.name}</h2>
}
```

It takes the same second argument as `use`, minus the options `useSuspenseQuery` does not have. In particular there is no `enabled` and no `skipToken`: a suspense query always fetches, so render the component conditionally instead.

Two `useSuspense` calls in one component run one after the other. To load in parallel, use `useSuspenseQueries` with [query options](#query-options). What the error boundary receives is covered in [Errors](/docs/builder/react-query/errors#error-boundaries).

## Query options

Calling the query itself returns a TanStack options object with the key and the query function filled in. Use it wherever TanStack takes options: `useQueries`, `useSuspenseQueries`, `useQuery`, `queryClient.query`.

```tsx
import { useQueries } from '@tanstack/react-query'

const results = useQueries({
  queries: userIds.map((userId) => userQuery({ urlParams: { userId } })),
})
// results[0].data: User | undefined
```

The call takes the same second argument as `use`:

```ts
userQuery({ urlParams: { userId } }, { staleTime: 60_000 })
```

## Status and headers

`withResponse: true` makes a query deliver `{ data, response }`, where `response` is `{ status, statusText, headers }` of the HTTP reply. Use it when a header matters to the UI: a total count, an ETag, a rate limit.

```tsx
export const usersPageQuery = client.query(listUsers, { withResponse: true })

const { data } = usersPageQuery.use({ params: { page: 2 } })

data?.data // User[]
data?.response.status // 200
data?.response.headers['x-total-count']
```

`headers` is a plain record with lower-cased names, so the cached value can be dehydrated and persisted. Failures are not wrapped; they stay in `error`. A `withResponse` query has its own cache entries, separate from the same endpoint declared without it.

## Cache helpers

Each helper takes the `QueryClient` first and the query's arguments second, and is typed from the endpoint.

| Helper | Does |
| --- | --- |
| `fetch(queryClient, args)` | Resolves with the data, from the cache when it is fresh. Rejects with the `EndpointError`. |
| `prefetch(queryClient, args)` | Same request, but resolves with nothing and never rejects. For warming the cache. |
| `ensure(queryClient, args)` | Resolves with cached data however old; fetches only when the entry is empty. |
| `getData(queryClient, args)` | Reads the entry synchronously. `undefined` when nothing is cached. |
| `setData(queryClient, args, updater)` | Writes the entry. `updater` is a value or `(current) => next`. |
| `invalidate(queryClient, args?, filters?)` | Marks entries stale and refetches the mounted ones. See [Keys and invalidation](/docs/builder/react-query/keys-and-invalidation#invalidating). |

A `signal` among the arguments of a hook or of `fetch` is combined with the one TanStack aborts when the query is cancelled or its last component unmounts, so either aborts the request.

```tsx
function UserLink({ userId }: { userId: string }) {
  const queryClient = useQueryClient()
  const args = { urlParams: { userId } }

  return (
    // Warm the cache before the user navigates
    <a href={`/users/${userId}`} onMouseEnter={() => userQuery.prefetch(queryClient, args)}>
      {userQuery.getData(queryClient, args)?.name ?? 'User'}
    </a>
  )
}
```

```ts
// Write an entry without a request
userQuery.setData(queryClient, { urlParams: { userId } }, (user) => user && { ...user, name: 'Ada' })
```

`fetch`, `prefetch` and `ensure` are built on `queryClient.query()`. To give one of them TanStack options such as `staleTime`, call that method yourself with the [query options](#query-options). Their use on a server is covered in [SSR and prefetching](/docs/builder/react-query/ssr).

## POST queries

A query is any endpoint whose result you want cached, whatever its method. A search that sends its criteria in the body is still a read:

```ts
// userSchema from the Builder quick start
export const searchUsersQuery = client.query({
  method: 'POST',
  url: '/users/search',
  requestSchema: z.object({ text: z.string(), roles: z.array(z.string()).optional() }),
  responseSchema: z.array(userSchema),
})
```

```tsx
const { data } = searchUsersQuery.use({ data: { text: 'ada' } })
```

The body is part of the cache key, so each distinct search has its own entry.

Related: [Infinite queries](/docs/builder/react-query/infinite-queries), [Keys and invalidation](/docs/builder/react-query/keys-and-invalidation).
