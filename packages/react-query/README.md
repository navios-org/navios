# @navios/react-query

Turns [`@navios/builder`](https://www.npmjs.com/package/@navios/builder) endpoint declarations into [TanStack Query](https://tanstack.com/query) hooks. Arguments, data and errors keep the types the declaration gives them, and cache keys are built for you.

**[Documentation](https://navios.tech/docs/builder/react-query/)** · [API reference](https://navios.tech/docs/builder/reference/react-query)

## Install

```bash
npm install @navios/react-query@next @navios/builder@next @tanstack/react-query
```

The 2.0 alpha is published under the `next` tag. All `@navios` packages of a project must have the same alpha version, because an alpha may break between releases.

Requires `@tanstack/react-query` `^5.102.0`. The examples also use `@navios/http` and `zod`; any HTTP client and any [Standard Schema](https://standardschema.dev) library work.

## Example

```tsx
import { builder } from '@navios/builder'
import { create } from '@navios/http'
import { declareClient } from '@navios/react-query'
import { z } from 'zod/v4'

const API = builder({ client: create({ baseURL: 'https://api.example.com' }) })
const client = declareClient({ api: API })

const userSchema = z.object({ id: z.string(), name: z.string() })

const userQuery = client.query({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
  errorSchema: {
    404: z.object({ message: z.string() }),
  },
})

const useRenameUser = client.mutation({
  method: 'PATCH',
  url: '/users/$userId',
  requestSchema: z.object({ name: z.string() }),
  responseSchema: userSchema,
  invalidates: [userQuery],
})

function UserCard({ userId }: { userId: string }) {
  const { data: user, isPending, error } = userQuery.use({ urlParams: { userId } })
  const rename = useRenameUser()

  if (isPending) return <p>Loading…</p>
  if (error) {
    // error is an EndpointError; its body is typed from errorSchema
    if (error.kind === 'http' && error.status === 404) return <p>{error.body.message}</p>
    return <p>Something went wrong</p>
  }

  return (
    <button onClick={() => rename.mutate({ urlParams: { userId }, data: { name: 'Ada' } })}>
      {user.name}
    </button>
  )
}
```

`client.query`, `client.infiniteQuery` and `client.mutation` accept an inline declaration, as above, or an endpoint already declared with `API.declareEndpoint` — so one declaration can serve your hooks, plain calls and a Navios server.

## What you get

| Need                                       | How                                                      | Docs                                                                                                |
| ------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `useQuery` and `useSuspenseQuery`          | `query.use(args)`, `query.useSuspense(args)`             | [Queries](https://navios.tech/docs/builder/react-query/queries)                                     |
| Paginated and endless lists                | `client.infiniteQuery`                                   | [Infinite queries](https://navios.tech/docs/builder/react-query/infinite-queries)                   |
| Mutations with typed callbacks             | `client.mutation`, `invalidates`, `useContext`           | [Mutations](https://navios.tech/docs/builder/react-query/mutations)                                 |
| Optimistic UI with rollback                | the `optimistic` setting                                 | [Optimistic updates](https://navios.tech/docs/builder/react-query/optimistic-updates)               |
| Cache keys you never write by hand         | `query.key(args)`, `query.invalidate(queryClient, args)` | [Keys and invalidation](https://navios.tech/docs/builder/react-query/keys-and-invalidation)         |
| One entry for a search box or a filter bar | `keyBy: { params: false }`                               | [Shared entries](https://navios.tech/docs/builder/react-query/keys-and-invalidation#shared-entries) |
| Typed errors in components and boundaries  | `error.kind`, `error.status`, `error.body`               | [Errors](https://navios.tech/docs/builder/react-query/errors)                                       |
| File uploads and downloads                 | `body: 'multipart'`, `response: 'blob'`                  | [Uploads and downloads](https://navios.tech/docs/builder/react-query/uploads-and-downloads)         |
| Server rendering, per-request HTTP clients | `query.prefetch`, `setHttpClient`                        | [SSR and prefetching](https://navios.tech/docs/builder/react-query/ssr)                             |
| Status and headers next to the data        | `withResponse: true`                                     | [Queries](https://navios.tech/docs/builder/react-query/queries)                                     |

Every TanStack Query option is still available on the hooks; this package only removes the parts you would otherwise write by hand.

## Upgrading from 1.x

Errors, cache keys and several helper names changed in 2.0. See [Migrating to 2.0](https://navios.tech/docs/builder/reference/migrating-to-2) for before-and-after examples, or [CHANGELOG.md](./CHANGELOG.md) for the full list.

## License

MIT
