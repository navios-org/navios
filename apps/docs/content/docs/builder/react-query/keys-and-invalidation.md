---
title: Keys and invalidation
---

# Keys and invalidation

You never write a cache key by hand. Every query builds its keys from the endpoint and the arguments, in one fixed shape, and that shape is what makes invalidation precise. Read this page when you need to refresh, remove or address cache entries.

## The key shape

```
[...keyPrefix, method, urlTemplate, ...keySuffix, 'with-response'?, 'query' | 'infinite', { keyBy }?, inputs?]
```

`key` builds one:

```ts
// userQuery from the React Query quick start; usersQuery from Queries
userQuery.key({ urlParams: { userId: 42 } })
// ['GET', '/users/$userId', 'query', { urlParams: { userId: '42' } }]

usersQuery.key({ params: { role: 'admin', page: 2 } })
// ['GET', '/users', 'query', { params: { role: 'admin', page: 2 } }]

usersQuery.key()
// ['GET', '/users', 'query']

usersQuery.endpointKey
// ['GET', '/users']
```

- **The endpoint comes first.** The method and the URL template, not the bound URL, identify it. `/users` is one segment, so it is never a prefix of `/users/$userId`, and `GET /users` never collides with `POST /users`.
- **The inputs come last**, as one object with `urlParams`, `params` and `data`. Empty parts are dropped. `signal`, `headers` and `timeout` never enter the key.
- **URL parameter values are stringified**, so `42` and `'42'` are the same entry, as they are the same URL.
- **The form comes between them.** `'query'` marks a plain query and `'infinite'` an infinite one, after `'with-response'` when the declaration has `withResponse: true`. The forms of one endpoint cache different shapes of data, and with a marker each, the key of one form is never a prefix of another's. `{ keyBy }` marks [shared entries](#shared-entries).

Inputs go into the key as you passed them, before validation. `usersQuery.use()` and `usersQuery.use({ params: { page: 1 } })` are two entries even when the schema's default makes them the same request.

Values that TanStack cannot hash by content are rewritten so they can be: a `File` by its name, size, type and modification time, a `Blob` by size and type, a `Date` as its ISO string, and `Map`, `Set`, `URLSearchParams`, `FormData` and `bigint` by their contents.

## Three scopes

TanStack matches keys by prefix, and matches objects partially. With the endpoint first and the inputs last, `key` addresses three scopes with the same call:

```ts
// Every entry of the query: every cached user list
usersQuery.key()

// Partial arguments: every page and search of the admin list
usersQuery.key({ params: { role: 'admin' } })

// Full arguments: one entry
usersQuery.key({ params: { role: 'admin', page: 2 } })
```

The argument is typed as any subset of the endpoint's inputs, so a misspelled parameter is a compile error.

Every entry a key matches holds the query's data, which is why the key can carry its type. A fourth scope is wider: `usersQuery.endpointKey` is the prefix of every entry of the endpoint, in every form. A plain query, an infinite query and a `withResponse` query of one endpoint all have the same `endpointKey`. Those entries hold different shapes of data, so the key is untyped: use it to invalidate, cancel or remove, not to read or write.

## Invalidating

`invalidate` marks the matching entries stale and refetches the ones that are mounted. It returns a promise that resolves when those refetches finish.

```ts
const queryClient = useQueryClient()

await usersQuery.invalidate(queryClient)
await usersQuery.invalidate(queryClient, { params: { role: 'admin' } })
await userQuery.invalidate(queryClient, { urlParams: { userId } }, { exact: true })
```

The third argument takes TanStack's [invalidation filters](https://tanstack.com/query/latest/docs/framework/react/guides/filters) other than `queryKey`: `exact`, `refetchType`, `predicate`, `stale`.

Without arguments, `invalidate` uses the `endpointKey`: `usersQuery.invalidate(queryClient)` also refreshes the endpoint's infinite and `withResponse` entries, whichever of the declarations you call it on. Scoped by arguments, it touches only its own form. To refresh one form without arguments, pass its key to TanStack: `queryClient.invalidateQueries({ queryKey: usersQuery.key() })`.

Most invalidation follows a mutation. Declare that on the mutation with [`invalidates`](/docs/builder/react-query/mutations#invalidating-queries) instead of calling `invalidate` in a component.

## Using keys with the QueryClient

A key works anywhere TanStack takes a `queryKey`:

```ts
queryClient.removeQueries({ queryKey: userQuery.key({ urlParams: { userId } }) })
await queryClient.cancelQueries({ queryKey: usersQuery.key() })
queryClient.removeQueries({ queryKey: usersQuery.endpointKey }) // every form of the endpoint

const user = queryClient.getQueryData(userQuery.key({ urlParams: { userId } }))
//    ^? User | undefined
```

Keys are tagged with the type of the data stored under them, which is why `getQueryData` above is typed. For plain reads and writes, the [cache helpers](/docs/builder/react-query/queries#cache-helpers) are shorter.

## Shared entries

By default every input identifies an entry, so every search, filter and page has one of its own. `keyBy` says which inputs identify the entry. The ones it leaves out are **shared**: every component using the entry sees the result for the values sent last.

```tsx
// userSchema from the React Query quick start
const searchUsers = client.query({
  method: 'GET',
  url: '/users',
  querySchema: z.object({ q: z.string(), role: z.string().optional() }),
  responseSchema: z.array(userSchema),
  keyBy: { params: false },
})

function SearchBox() {
  const [q, setQ] = useState('')
  searchUsers.use({ params: { q } }) // sends q: the entry refetches for everyone
  return <input value={q} onChange={(event) => setQ(event.target.value)} />
}

function ResultCount() {
  const { data } = searchUsers.use() // the result of the last search
  return <span>{data?.length ?? 0} users</span>
}
```

| `keyBy`                | Entries                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `{ params: false }`    | One per URL; the query params are shared. `urlParams` and `data` can be left out the same way |
| `{ params: ['role'] }` | One per `role`; the other query params are shared. Field lists work for object parts          |
| `false`                | One for the endpoint                                                                          |

Part and field names are checked against the endpoint's schemas.

### Sending and reading

- **A call that has a shared input sends it.** That is `use`, `useSuspense`, `fetch`, `prefetch` and `ensure`; a hook sends on mount and whenever the value changes. When the entry's data came from other values, it refetches, and every component on the entry gets the new result.
- **"Has" means the property is there**, even as `undefined`: `{ params: { q: undefined } }` clears `q`. A part left out with `false` is replaced as a whole. With a field list, each field is its own shared input, so a call replaces the fields it has and keeps the others.
- **A call without them reads the entry.** It shows the entry as it is, and any request it causes (mount, window focus, invalidation) uses the values sent last, or none if nothing was sent yet. Add `enabled: false` to a component that should only show what others sent.
- **A disabled hook sends nothing**: with `enabled: false`, or with `skipToken` as its args.
- **`fetch` and `ensure` that send new values fetch**, however fresh the entry is.

The options a call returns, `key`, `invalidate`, `getData` and `setData` take only the inputs that identify the entry; a shared input there is a compile error. Options cannot react when a value changes, so they use the values sent last: send from a hook or from `fetch`.

```ts
searchUsers.key() // ['GET', '/users', 'query', { keyBy: 'params:false' }]
await searchUsers.fetch(queryClient, { params: { q: 'ada' } }) // sends q, fetches
await searchUsers.invalidate(queryClient) // refetches with q: 'ada'
```

### What to know

- Shared values are kept per `QueryClient` and per entry. They go away with the entry: after `gcTime` without observers, `removeQueries` or `clear`.
- Until the request for new values resolves, the entry holds the previous result, as in a background refetch: `isFetching` is `true`, `isPending` is not, and `useSuspense` does not suspend again. Show the change with `isFetching`.
- A request that resolves after the shared values changed is made again with the new ones, so the entry never shows a result for values nobody holds anymore. One that fails or is cancelled (`cancelQueries`, an optimistic update, the last component unmounting) leaves the entry's data for the values it had, so the next call that sends the new values fetches them.
- Data that arrived without a request of this `QueryClient` (`hydrate`, `setData`) is trusted to match the first values sent; a later change fetches. Shared values do not travel with `dehydrate`, so the components that send them on the server send them in the browser too. Hydrating over an entry that already has shared values keeps them until a component sends new ones.
- The `{ keyBy }` marker, the rule as a string (`'params:false'`, `'params:["role"]'`), keeps shared entries apart from a declaration of the same endpoint without `keyBy`, and two declarations with different rules apart from each other. The key without arguments of a declaration without `keyBy` still reaches them, and so does the `endpointKey`.
- Infinite queries and mutations do not take `keyBy`: an infinite query's params are its first page, and a mutation key has no inputs.

## Prefix and suffix

`keyPrefix` puts segments before the endpoint and `keySuffix` right after it. Set them for a whole client with `defaults`, or for one query or mutation:

```ts
import { declareClient } from '@navios/react-query'

// API and getUser from the Builder quick start
const client = declareClient({ api: API, defaults: { keyPrefix: ['tenant-1'] } })

const userQuery = client.query(getUser, { keySuffix: ['v2'] })

userQuery.key({ urlParams: { userId: '42' } })
// ['tenant-1', 'GET', '/users/$userId', 'v2', 'query', { urlParams: { userId: '42' } }]
```

A declaration's own segments are added to the client's, never replace them: the client prefix comes first and the client suffix right after the URL.

```ts
const scoped = client.query(getUser, { keyPrefix: ['admin'], keySuffix: ['v2'] })
scoped.endpointKey
// with defaults { keyPrefix: ['tenant-1'], keySuffix: ['beta'] }:
// ['tenant-1', 'admin', 'GET', '/users/$userId', 'beta', 'v2']
```

So `['tenant-1']` stays a handle for every entry of the client, whatever its queries add.

Reach for a prefix when two clients would otherwise share entries: two builders that expose the same paths on different backends, or one `QueryClient` holding data for several tenants or accounts. A prefix also gives you one handle for all of it:

```ts
queryClient.invalidateQueries({ queryKey: ['tenant-1'] })
```

A suffix separates variants of one endpoint, for example a declaration whose response shape changed while old entries may still sit in a persisted cache.

Related: [Queries](/docs/builder/react-query/queries), [Mutations](/docs/builder/react-query/mutations).
