# @navios/react-query

Type-safe React Query integration for Navios API client with schema validation (Zod, or any Standard Schema library).

## Features

- **Type Safety** - Arguments, data and errors are inferred from the endpoint's schemas
- **Schema Validation** - Request and response validation with Zod or any other Standard Schema library
- **React Query Integration** - A thin layer over TanStack Query v5; every TanStack option is still available
- **Declarative API** - Define endpoints once, use everywhere
- **Typed Errors** - Failures are `EndpointError`s in React Query's error channel, typed from `errorSchema`
- **Predictable Keys** - One key shape, three invalidation scopes, no hand-written keys
- **Declarative Cache Updates** - `invalidates` and `optimistic` settings on mutations
- **Response Metadata** - `withResponse: true` delivers the status and headers next to the data
- **SSR/RSC Support** - `prefetch` / `ensure` helpers and per-request HTTP clients
- **Uploads and Downloads** - `body: 'multipart'` and `response: 'blob'` endpoints work as regular mutations and queries

## Installation

```bash
npm install @navios/react-query @navios/builder @navios/http zod @tanstack/react-query
```

Peer dependencies: `@navios/builder`, `@tanstack/react-query` `^5.102.0`, `zod` `^3.25.0 || ^4.0.0`.

## Quick Start

```typescript
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { declareClient } from '@navios/react-query'
import { z } from 'zod/v4'

const api = builder({ client: create({ baseURL: 'https://api.example.com' }) })

// Returns { query, infiniteQuery, mutation }
const client = declareClient({ api })

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

const getUser = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  errorSchema: {
    404: z.object({ message: z.string() }),
  },
})

function UserProfile({ userId }: { userId: string }) {
  const { data, isPending, error } = getUser.use({ urlParams: { userId } })

  if (isPending) return <div>Loading...</div>
  if (error) {
    if (error.kind === 'http' && error.status === 404) {
      return <div>{error.body.message}</div> // typed from errorSchema[404]
    }
    return <div>Something went wrong</div>
  }

  return <div>{data.name}</div>
}
```

Each client method accepts either an inline endpoint declaration (as above) or an endpoint already declared with `api.declareEndpoint`:

```typescript
const getUserEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

const getUser = client.query(getUserEndpoint)
getUser.endpoint // the same handler
```

## Queries

### Hooks

```typescript
const listUsers = client.query({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.number().optional(),
    search: z.string().optional(),
  }),
  responseSchema: z.array(userSchema),
})

// useQuery — args are optional when the endpoint requires nothing
const { data } = listUsers.use()
const { data: page2 } = listUsers.use({ params: { page: 2 } })

// useSuspenseQuery — data is always defined
const { data: users } = listUsers.useSuspense({ params: { page: 1 } })
```

The second argument of `use` / `useSuspense` accepts every TanStack option except `queryKey` and `queryFn`:

```typescript
const { data: name } = getUser.use(
  { urlParams: { userId } },
  { staleTime: 60_000, enabled: isOpen, select: (user) => user.name },
)
```

Pass `skipToken` instead of the arguments while an input is unknown:

```typescript
import { skipToken } from '@tanstack/react-query'

const { data } = getUser.use(userId ? { urlParams: { userId } } : skipToken)
```

### Query Options

Calling the query returns TanStack query options, for `useQuery`, `useSuspenseQuery`, `useQueries` and `queryClient.query`:

```typescript
const results = useQueries({
  queries: userIds.map((userId) => getUser({ urlParams: { userId } })),
})
```

### Response Metadata

`withResponse: true` makes a query deliver `{ data, response }`, where `response` is `{ status, statusText, headers }` of the HTTP reply. Use it when a header matters to the UI (ETag, pagination totals, rate limits).

```typescript
const listUsers = client.query({
  method: 'GET',
  url: '/users',
  responseSchema: z.array(userSchema),
  withResponse: true,
})

// or, from an existing endpoint
const getUser = client.query(getUserEndpoint, { withResponse: true })

const { data } = listUsers.use()
data?.data // User[]
data?.response.status // 200
data?.response.headers['x-total-count']
```

- `headers` is a plain record with lower-cased names, so the cached value is serializable — safe for SSR dehydration and cache persistence.
- Failures are not wrapped: they stay in the error channel as the endpoint's `EndpointError`.
- Such entries live under their own cache key (a `'with-response'` marker), apart from the same endpoint declared without the option.
- The option is available on `client.query`, `client.infiniteQuery` (every page is wrapped) and `client.mutation` (the mutation's data, `onSuccess` and `onSettled` receive the wrapped value).

### Cache Helpers

```typescript
const queryClient = useQueryClient()
const args = { urlParams: { userId } }

await getUser.fetch(queryClient, args) // data; rejects with the EndpointError
await getUser.prefetch(queryClient, args) // void; never rejects
await getUser.ensure(queryClient, args) // cached data however stale, else fetch

getUser.getData(queryClient, args) // User | undefined
getUser.setData(queryClient, args, (old) => old && { ...old, name: 'Ada' })

await getUser.invalidate(queryClient, args)
```

`fetch`, `prefetch` and `ensure` are built on TanStack's `queryClient.query()`, because `fetchQuery`, `prefetchQuery` and `ensureQueryData` are deprecated upstream. This is why `@tanstack/react-query ^5.102.0` is required.

### POST Queries

```typescript
const searchUsers = client.query({
  method: 'POST',
  url: '/users/search',
  requestSchema: z.object({ query: z.string() }),
  responseSchema: z.array(userSchema),
})

// The body is part of the cache key
const { data } = searchUsers.use({ data: { query: 'ada' } })
```

## Query Keys and Invalidation

Keys have one shape:

```
[...keyPrefix, method, urlTemplate, ...keySuffix, 'with-response'?, 'infinite'?, inputs?]
```

`inputs` is `{ urlParams?, params?, data? }`. URL param values are stringified, empty parts are dropped, and `signal` / `headers` / `timeout` are never included. `'with-response'` marks queries declared with `withResponse: true` and `'infinite'` marks infinite queries, so each form of an endpoint has its own entries.

```typescript
getUser.key({ urlParams: { userId: 42 }, params: { expand: 'team' } })
// ['GET', '/users/$userId', { urlParams: { userId: '42' }, params: { expand: 'team' } }]
```

Because the endpoint comes first and the inputs last, `key` and `invalidate` have three scopes:

```typescript
// Whole endpoint: every entry of GET /users/$userId, and nothing from another endpoint
await getUser.invalidate(queryClient)

// Partial args: every entry for this user, whatever the query params
await getUser.invalidate(queryClient, { urlParams: { userId } })

// Exact: one entry
await getUser.invalidate(queryClient, { urlParams: { userId } }, { exact: true })
```

Always build keys with `query.key(...)` instead of writing them by hand. Keys carry the data type, so `queryClient.getQueryData(getUser.key(args))` is typed.

`keyPrefix` / `keySuffix` can be set for a whole client or per declaration:

```typescript
const client = declareClient({ api, defaults: { keyPrefix: ['tenant-1'] } })

const getUser = client.query(getUserEndpoint, { keySuffix: ['v2'] })
// ['tenant-1', 'GET', '/users/$userId', 'v2', ...]
```

## Infinite Queries

The endpoint needs a `querySchema`; the page param is a set of query params.

```typescript
const listPosts = client.infiniteQuery({
  method: 'GET',
  url: '/posts',
  querySchema: z.object({
    cursor: z.string().optional(),
    limit: z.number().optional(),
  }),
  responseSchema: z.object({
    posts: z.array(postSchema),
    nextCursor: z.string().nullable(),
  }),
  getNextPageParam: (lastPage, allPages, lastPageParam, allPageParams) =>
    lastPage.nextCursor ? { cursor: lastPage.nextCursor } : undefined,
})

function PostList() {
  const { data, fetchNextPage, hasNextPage } = listPosts.use({ params: { limit: 20 } })

  return (
    <div>
      {data?.pages.flatMap((page) => page.posts.map((post) => <Post key={post.id} post={post} />))}
      {hasNextPage && <button onClick={() => fetchNextPage()}>Load More</button>}
    </div>
  )
}
```

- Each page is requested with the page param merged over the call's `params`.
- The first page param defaults to the call's `params`, exactly as passed (it is not run through `querySchema`, so schema defaults do not appear in it); set `initialPageParam` to override it.
- `getNextPageParam` returns the query params for the next page, or `undefined` when there are no more. `getPreviousPageParam` is optional.
- An infinite query has the same helpers as a query; its data is `InfiniteData<Page, PageParam>` and its key carries an `'infinite'` marker.

## Mutations

`client.mutation` returns a hook that takes no arguments:

```typescript
const updateUser = client.mutation({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: z.object({ name: z.string() }),
  responseSchema: userSchema,
  errorSchema: {
    409: z.object({ reason: z.string() }),
  },
})

function EditUser({ userId }: { userId: string }) {
  const { mutate, isPending, error } = updateUser()

  return (
    <div>
      <button
        disabled={isPending}
        onClick={() => mutate({ urlParams: { userId }, data: { name: 'Ada' } })}
      >
        Rename
      </button>
      {error?.kind === 'http' && error.status === 409 && <p>{error.body.reason}</p>}
    </div>
  )
}
```

Endpoints without a response body use `response: 'void'`:

```typescript
const deleteUser = client.mutation({
  method: 'DELETE',
  url: '/users/$userId',
  response: 'void',
})
```

### Settings

Any TanStack mutation option (`retry`, `scope`, `meta`, `gcTime`, ...) plus:

```typescript
const updateUser = client.mutation(updateUserEndpoint, {
  // Invalidated after success: a query (whole endpoint) or a function returning a key
  invalidates: [listUsers, (data, variables) => getUser.key({ urlParams: variables.urlParams })],

  // Applied before the request, rolled back on failure, invalidated on settle
  optimistic: (update) =>
    update(getUser, {
      args: (variables) => ({ urlParams: variables.urlParams }),
      update: (current, variables) => current && { ...current, ...variables.data },
    }),

  // A hook; its result is merged into the context of every callback
  useContext: () => ({ toast: useToast() }),

  onMutate: (variables, context) => ({ startedAt: Date.now() }),
  onSuccess: (data, variables, context) => {
    context.toast.success('Saved')
  },
  onError: (error, variables, context) => {
    context.toast.error(error.message)
  },
  onSettled: (data, error, variables, context) => {
    console.log(Date.now() - (context.onMutateResult?.startedAt ?? 0))
  },
})
```

The callback context is the result of `useContext()` merged with TanStack's `{ client, meta, mutationKey }`, plus `onMutateResult` in `onSuccess` / `onError` / `onSettled`. The `QueryClient` is `context.client`:

```typescript
onSuccess: (user, variables, context) => {
  getUser.setData(context.client, { urlParams: variables.urlParams }, user)
},
```

`optimistic` may return an array to update several queries; each update accepts `rollbackOnError` and `invalidateOnSettled` (both default to `true`). `args` is required when the target query has required inputs (as `getUser` does) and optional otherwise.

`withResponse: true` is accepted here too: the mutation's data becomes `{ data, response: { status, statusText, headers } }` in the hook result and in `onSuccess` / `onSettled`.

### Mutation Key and In-Flight State

```typescript
updateUser.mutationKey // ['PATCH', '/users/$userId']

const isSavingAny = updateUser.useIsMutating()
const isSavingThis = updateUser.useIsMutating({ urlParams: { userId } })
```

## File Uploads

An upload is a mutation on an endpoint declared with `body: 'multipart'`:

```typescript
const uploadAvatar = client.mutation({
  method: 'POST',
  url: '/users/$userId/avatar',
  body: 'multipart',
  requestSchema: z.object({ file: z.instanceof(File) }),
  responseSchema: z.object({ url: z.string() }),
})

const { mutate } = uploadAvatar()
mutate({ urlParams: { userId }, data: { file } })
```

## File Downloads

Declare the response kind instead of a `responseSchema`: `'blob'`, `'text'`, `'stream'` or `'void'`.

```typescript
const downloadFile = client.mutation({
  method: 'GET',
  url: '/files/$fileId/download',
  response: 'blob',
})

const { mutateAsync } = downloadFile()
const blob = await mutateAsync({ urlParams: { fileId } }) // Blob
```

## Error Handling

Queries and mutations call the throwing form of the endpoint. Every failure is an `EndpointError` in React Query's error channel — `error` on the hook result, the argument of `onError`, the value thrown to an error boundary by `useSuspense`.

```typescript
const { error } = getUser.use({ urlParams: { userId } })

if (error) {
  switch (error.kind) {
    case 'http': // status declared in errorSchema; body is the schema output
      if (error.status === 404) error.body.message
      break
    case 'http-unknown': // any other non-2xx status; body is unknown
    case 'request-validation': // args failed their schema, nothing was sent; error.issues
    case 'response-validation': // the response failed its schema; error.issues
    case 'network':
    case 'timeout':
    case 'aborted':
    case 'config':
      break
  }
}
```

Where the value is `unknown` (a `catch` block, an error boundary), use the guards from `@navios/builder`:

```typescript
import { isEndpointError, isHttpError } from '@navios/builder'

if (isHttpError(error, 404)) {
  // ...
}
```

For logging, register `onError` on the builder; it receives the same `EndpointError`:

```typescript
const api = builder({
  client: httpClient,
  onError: (error) => reportError(error.toJSON()),
})
```

## SSR and Prefetching

```typescript
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'

async function UserPage({ userId }: { userId: string }) {
  const queryClient = new QueryClient()

  await Promise.all([
    getUser.prefetch(queryClient, { urlParams: { userId } }),
    listPosts.prefetch(queryClient, { params: { limit: 20 } }),
  ])

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <UserProfile userId={userId} />
    </HydrationBoundary>
  )
}
```

`prefetch` never rejects. Use `fetch` or `ensure` when the server needs the data or must react to a failure.

### Per-Request HTTP Client

`setHttpClient` binds an HTTP client to a `QueryClient`. Every query, infinite query and mutation that runs through that `QueryClient` uses it instead of the builder's shared client — the way to carry one request's cookies or token on a server:

```typescript
import { getHttpClient, setHttpClient } from '@navios/react-query'

const queryClient = new QueryClient()
setHttpClient(queryClient, create({ baseURL, headers: { cookie } }))

await getUser.prefetch(queryClient, { urlParams: { userId } })

getHttpClient(queryClient) // the bound client, or undefined
setHttpClient(queryClient, null) // remove the binding
```

## API Reference

### `declareClient(options)`

- `api` - The builder created with `@navios/builder`
- `defaults` - Optional `{ keyPrefix?, keySuffix? }` applied to every key

Returns `{ query, infiniteQuery, mutation }`.

| Method                                               | Returns               |
| ---------------------------------------------------- | --------------------- |
| `client.query(config \| endpoint, options?)`         | `QueryObject`         |
| `client.infiniteQuery(config \| endpoint, settings)` | `InfiniteQueryObject` |
| `client.mutation(config \| endpoint, settings?)`     | `MutationObject`      |

The inline `config` is the builder's endpoint options (`method`, `url`, `querySchema`, `requestSchema`, `responseSchema`, `responses`, `errorSchema`, `urlParamsSchema`, `body`, `response`, `headers`, `timeout`, `clientOptions`, `validateResponse`) plus the method's own settings. Every method also accepts `keyPrefix`, `keySuffix` and `withResponse`.

### Query Object

| Member                                           | Description                                              |
| ------------------------------------------------ | -------------------------------------------------------- |
| `query(args, options?)`                          | TanStack query options                                   |
| `query.use(args \| skipToken, options?)`         | `useQuery`                                               |
| `query.useSuspense(args, options?)`              | `useSuspenseQuery`                                       |
| `query.key(args?)`                               | Cache key: whole endpoint, partial args or exact         |
| `query.fetch(queryClient, args)`                 | Data through the cache; rejects with the `EndpointError` |
| `query.prefetch(queryClient, args)`              | Warms the cache; never rejects                           |
| `query.ensure(queryClient, args)`                | Cached data however stale, else fetch                    |
| `query.getData(queryClient, args)`               | Reads the cache entry                                    |
| `query.setData(queryClient, args, updater)`      | Writes the cache entry                                   |
| `query.invalidate(queryClient, args?, filters?)` | Invalidates matching entries; returns a promise          |
| `query.endpoint`                                 | The endpoint handler                                     |

### Mutation Object

| Member                                   | Description                                   |
| ---------------------------------------- | --------------------------------------------- |
| `mutation()`                             | The hook; returns `UseMutationResult`         |
| `mutation.mutationKey`                   | `[...keyPrefix, method, url, ...keySuffix]`   |
| `mutation.useIsMutating({ urlParams? })` | `true` while a matching mutation is in flight |
| `mutation.endpoint`                      | The endpoint handler                          |

### Mutation Settings

| Setting                  | Description                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalidates`            | Queries, or `(data, variables) => key`, invalidated after success                                                                            |
| `optimistic`             | `(update) => update(query, { args, update, rollbackOnError?, invalidateOnSettled? })`; `args` is required when the query has required inputs |
| `useContext`             | Hook whose result is merged into the callback context                                                                                        |
| `onMutate`               | `(variables, context) => onMutateResult`                                                                                                     |
| `onSuccess`              | `(data, variables, context) => void`                                                                                                         |
| `onError`                | `(error, variables, context) => void`                                                                                                        |
| `onSettled`              | `(data, error, variables, context) => void`                                                                                                  |
| `keyPrefix`, `keySuffix` | Key segments                                                                                                                                 |
| `withResponse`           | `true` delivers `{ data, response }` instead of the bare data                                                                                |
| ...                      | Any TanStack `useMutation` option except `mutationKey` / `mutationFn`                                                                        |

### Other Exports

- `setHttpClient(queryClient, client | null)`, `getHttpClient(queryClient)` - bind an HTTP client to a `QueryClient`
- `makeQuery(endpoint, options?)`, `makeInfiniteQuery(endpoint, settings)`, `makeMutation(endpoint, settings?)` - the factories behind the client methods, for use without a client instance
- `DataWithResponse<Data>`, `SurfaceOptions` - the data shape and the options type of `withResponse`

## Migration to 2.0.0

See [CHANGELOG.md](./CHANGELOG.md) for the full list with before → after examples.

### From 1.x

- **Errors**: failures are always in React Query's error channel as the endpoint's `EndpointError`. Narrow on `error.kind` / `error.status`; `error.body` is typed from `errorSchema`. `useDiscriminatorResponse` and the per-helper `onFail` are gone; register `onError` on the builder for logging.
- **Uploads**: `client.multipartMutation(config)` → `client.mutation({ ...config, body: 'multipart' })`.
- **Downloads**: endpoints declared with `declareStream` → `declareEndpoint({ ..., response: 'blob' })`, used with `client.mutation` or `client.query`.
- **From-endpoint methods**: `client.queryFromEndpoint` / `mutationFromEndpoint` / `infiniteQueryFromEndpoint` → pass the endpoint to `client.query` / `client.mutation` / `client.infiniteQuery`.
- **`processResponse`** → TanStack's `select` on the hook call.
- **Keys**: `query.queryKey.dataTag(args)` / `filterKey(args)` → `query.key(args)`. Every key changed shape, so hand-written keys must be replaced and persisted caches discarded.
- **Invalidation**: `invalidateAll(queryClient, args)` → `invalidate(queryClient, args)`; `invalidate` returns the promise directly.
- **Scoped mutations**: `useKey: true` and `mutation({ urlParams })` → `mutation()` plus `mutation.useIsMutating({ urlParams })`.
- **Mutation context**: `context.queryClient` from `useContext: () => ({ queryClient: useQueryClient() })` → `context.client`.
- **Optimistic helpers**: `createOptimisticUpdate` / `createMultiOptimisticUpdate` → the `optimistic` setting.
- **Prefetch helpers**: `createPrefetchHelper(query).prefetch(queryClient, args)` → `query.prefetch(queryClient, args)`; `ensureData` → `query.ensure`.
- **Standalone factories**: `makeQueryOptions` / `makeInfiniteQueryOptions` → `makeQuery` / `makeInfiniteQuery`.
- **Peer dependency**: `@tanstack/react-query ^5.102.0`.

## License

MIT
