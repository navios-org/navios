---
title: Keys and invalidation
---

# Keys and invalidation

You never write a cache key by hand. Every query builds its keys from the endpoint and the arguments, in one fixed shape, and that shape is what makes invalidation precise. Read this page when you need to refresh, remove or address cache entries.

## The key shape

```
[...keyPrefix, method, urlTemplate, ...keySuffix, 'with-response'?, 'infinite'?, inputs?]
```

`key` builds one:

```ts
// userQuery from the React Query quick start; usersQuery from Queries
userQuery.key({ urlParams: { userId: 42 } })
// ['GET', '/users/$userId', { urlParams: { userId: '42' } }]

usersQuery.key({ params: { role: 'admin', page: 2 } })
// ['GET', '/users', { params: { role: 'admin', page: 2 } }]

usersQuery.key()
// ['GET', '/users']
```

- **The endpoint comes first.** The method and the URL template, not the bound URL, identify it. `/users` is one segment, so it is never a prefix of `/users/$userId`, and `GET /users` never collides with `POST /users`.
- **The inputs come last**, as one object with `urlParams`, `params` and `data`. Empty parts are dropped. `signal`, `headers` and `timeout` never enter the key.
- **URL parameter values are stringified**, so `42` and `'42'` are the same entry, as they are the same URL.
- **Markers keep the forms of an endpoint apart**: `'with-response'` for queries declared with `withResponse: true`, `'infinite'` for infinite queries.

Inputs go into the key as you passed them, before validation. `usersQuery.use()` and `usersQuery.use({ params: { page: 1 } })` are two entries even when the schema's default makes them the same request.

Values that TanStack cannot hash by content are rewritten so they can be: a `File` by its name, size, type and modification time, a `Blob` by size and type, and `Map`, `Set`, `URLSearchParams`, `FormData` and `bigint` by their contents.

## Three scopes

TanStack matches keys by prefix, and matches objects partially. With the endpoint first and the inputs last, `key` and `invalidate` address three scopes with the same call:

```ts
// Whole endpoint: every cached user list
usersQuery.key()

// Partial arguments: every page and search of the admin list
usersQuery.key({ params: { role: 'admin' } })

// Full arguments: one entry
usersQuery.key({ params: { role: 'admin', page: 2 } })
```

The argument is typed as any subset of the endpoint's inputs, so a misspelled parameter is a compile error.

## Invalidating

`invalidate` marks the matching entries stale and refetches the ones that are mounted. It returns a promise that resolves when those refetches finish.

```ts
const queryClient = useQueryClient()

await usersQuery.invalidate(queryClient)
await usersQuery.invalidate(queryClient, { params: { role: 'admin' } })
await userQuery.invalidate(queryClient, { urlParams: { userId } }, { exact: true })
```

The third argument takes TanStack's [invalidation filters](https://tanstack.com/query/latest/docs/framework/react/guides/filters) other than `queryKey`: `exact`, `refetchType`, `predicate`, `stale`.

A whole-endpoint key is also a prefix of the endpoint's `'with-response'` and `'infinite'` entries, so `usersQuery.invalidate(queryClient)` refreshes those too. Scoped by arguments, it touches only its own form.

Most invalidation follows a mutation. Declare that on the mutation with [`invalidates`](/docs/builder/react-query/mutations#invalidating-queries) instead of calling `invalidate` in a component.

## Using keys with the QueryClient

A key works anywhere TanStack takes a `queryKey`:

```ts
queryClient.removeQueries({ queryKey: userQuery.key({ urlParams: { userId } }) })
await queryClient.cancelQueries({ queryKey: usersQuery.key() })

const user = queryClient.getQueryData(userQuery.key({ urlParams: { userId } }))
//    ^? User | undefined
```

Keys are tagged with the type of the data stored under them, which is why `getQueryData` above is typed. For plain reads and writes, the [cache helpers](/docs/builder/react-query/queries#cache-helpers) are shorter.

## Prefix and suffix

`keyPrefix` puts segments before the endpoint and `keySuffix` right after it. Set them for a whole client with `defaults`, or for one query or mutation:

```ts
import { declareClient } from '@navios/react-query'

// API and getUser from the Builder quick start
const client = declareClient({ api: API, defaults: { keyPrefix: ['tenant-1'] } })

const userQuery = client.query(getUser, { keySuffix: ['v2'] })

userQuery.key({ urlParams: { userId: '42' } })
// ['tenant-1', 'GET', '/users/$userId', 'v2', { urlParams: { userId: '42' } }]
```

A value set on a declaration replaces the client default for that field; the two are not concatenated.

Reach for a prefix when two clients would otherwise share entries: two builders that expose the same paths on different backends, or one `QueryClient` holding data for several tenants or accounts. A prefix also gives you one handle for all of it:

```ts
queryClient.invalidateQueries({ queryKey: ['tenant-1'] })
```

A suffix separates variants of one endpoint, for example a declaration whose response shape changed while old entries may still sit in a persisted cache.

Related: [Queries](/docs/builder/react-query/queries), [Mutations](/docs/builder/react-query/mutations).
