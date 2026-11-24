---
sidebar_position: 6
---

# Query Key Management

Every query has a cache key built from its endpoint and its inputs. You never write keys by hand: `query.key(args)` builds them, typed with the data stored under them.

## Key Structure

```
[...keyPrefix, method, urlTemplate, ...keySuffix, 'with-response'?, 'infinite'?, inputs?]
```

- **`method` and `urlTemplate`** identify the endpoint. The URL template is one segment (`'/users/$userId'`, not `['users', '123']`), so `/users` is never a prefix of `/users/$userId`.
- **`'with-response'`** is present on queries declared with [`withResponse: true`](/docs/builder/react-query/guides/queries#response-metadata) only. Their entries hold `{ data, response }`, so they are kept apart from the entries of the same endpoint declared without it.
- **`'infinite'`** is present on infinite queries only, so a query and an infinite query on the same endpoint never share an entry.
- **`inputs`** is `{ urlParams?, params?, data? }` — the arguments that identify the request. It is omitted when there are none.

### Example

```typescript
const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  querySchema: z.object({ expand: z.string().optional() }),
  responseSchema: userSchema,
})

getUser.key({ urlParams: { userId: 42 }, params: { expand: 'team' } })
// ['GET', '/users/$userId', { urlParams: { userId: '42' }, params: { expand: 'team' } }]

getUser.key({ urlParams: { userId: 42 } })
// ['GET', '/users/$userId', { urlParams: { userId: '42' } }]

getUser.key()
// ['GET', '/users/$userId']
```

### What Goes into `inputs`

- `urlParams`, `params` and `data` only. `signal`, `headers` and `timeout` never affect the key.
- URL param values are stringified, so `{ userId: 1 }` and `{ userId: '1' }` are the same entry — they produce the same URL.
- Empty parts are dropped: `{}`, `{ params: {} }` and `{ params: { page: undefined } }` all give the key without `inputs`.
- The request body is included, so a POST query with different bodies has different entries.
- The method is part of the key, so `GET /users` and `POST /users` never collide.

## Three Scopes

Because the endpoint comes first and the inputs last, React Query's prefix matching gives three scopes from one function:

| Call                                      | Matches                                                        |
| ----------------------------------------- | -------------------------------------------------------------- |
| `getUser.key()`                           | Every entry of the endpoint, and nothing from another endpoint |
| `getUser.key({ urlParams: { userId } })`  | Every entry for that user, whatever the query params           |
| `getUser.key(fullArgs)`                   | The entry for exactly those arguments                          |

Partial arguments are typed: any subset of the endpoint's `urlParams`, `params` and `data`.

The markers sit between the endpoint and the inputs, which decides what each scope reaches when one endpoint is declared in several forms (plain, `withResponse`, infinite):

```typescript
const getUser = client.query(getUserEndpoint)
const getUserWithMeta = client.query(getUserEndpoint, { withResponse: true })

getUser.key() // ['GET', '/users/$userId']
getUserWithMeta.key() // ['GET', '/users/$userId', 'with-response']

getUser.key({ urlParams: { userId: 42 } })
// ['GET', '/users/$userId', { urlParams: { userId: '42' } }]
getUserWithMeta.key({ urlParams: { userId: 42 } })
// ['GET', '/users/$userId', 'with-response', { urlParams: { userId: '42' } }]
```

- The plain query's key **without args** is a prefix of every form, so `getUser.invalidate(queryClient)` also invalidates the `withResponse` and infinite entries of the endpoint.
- A key **with args**, and every key of a marked form, addresses that form only: `getUser.invalidate(queryClient, { urlParams: { userId } })` leaves the `withResponse` entry of that user alone. Invalidate each form you use.

The same scopes drive [`invalidate`](/docs/builder/react-query/guides/invalidation):

```typescript
await getUser.invalidate(queryClient) // whole endpoint
await getUser.invalidate(queryClient, { urlParams: { userId } }) // this user
await getUser.invalidate(queryClient, { urlParams: { userId } }, { exact: true }) // one entry
```

## Using Keys

:::tip
Always build keys with `query.key(...)`. A hand-written key such as `['users', userId]` matches nothing in the cache.
:::

### With the QueryClient

Keys are tagged with the data and error types, so `queryClient` methods are typed:

```typescript
const key = getUser.key({ urlParams: { userId } })

queryClient.getQueryData(key) // User | undefined
queryClient.getQueryState(key)
queryClient.removeQueries({ queryKey: key })
await queryClient.cancelQueries({ queryKey: getUser.key() })
```

The options built by calling the query carry the same key:

```typescript
getUser({ urlParams: { userId } }).queryKey
```

### Typed Cache Access

For reads and writes of one entry, the query's own helpers are shorter:

```typescript
getUser.getData(queryClient, { urlParams: { userId } })
getUser.setData(queryClient, { urlParams: { userId } }, (old) => old && { ...old, name: 'Ada' })
```

### In Mutations

`invalidates` accepts a function that returns a key:

```typescript
const updateUser = client.mutation({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: z.object({ name: z.string() }),
  responseSchema: userSchema,
  invalidates: [(_data, variables) => getUser.key({ urlParams: variables.urlParams })],
})
```

## Key Prefix and Suffix

`keyPrefix` and `keySuffix` add segments around the endpoint's identity. Set them for every query and mutation of a client, or for one declaration:

```typescript
const client = declareClient({
  api,
  defaults: { keyPrefix: ['tenant-1'] },
})

const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  keySuffix: ['v2'],
})

getUser.key({ urlParams: { userId: 1 } })
// ['tenant-1', 'GET', '/users/$userId', 'v2', { urlParams: { userId: '1' } }]
```

With an existing endpoint they go in the second argument:

```typescript
const getUser = client.query(getUserEndpoint, { keyPrefix: ['tenant-1'] })
```

A prefix shared by a whole client lets you address everything it cached at once:

```typescript
await queryClient.invalidateQueries({ queryKey: ['tenant-1'] })
```

## Mutation Keys

Mutations use the same identity without inputs:

```typescript
updateUser.mutationKey // ['PATCH', '/users/$userId']
```

The `'with-response'` marker is never part of a mutation key.

## Next Steps

- [Invalidation](/docs/builder/react-query/guides/invalidation) - Refresh cached data
- [Queries](/docs/builder/react-query/guides/queries) - Cache helpers on a query
- [Client Configuration](/docs/builder/react-query/advanced/query-client-config) - Client-wide key options
