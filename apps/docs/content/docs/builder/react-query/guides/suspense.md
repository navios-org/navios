---
sidebar_position: 8
---

# Suspense

`useSuspense()` is TanStack's `useSuspenseQuery` for an endpoint: the component suspends while the data loads and throws to the nearest error boundary when the request fails, so `data` is always defined.

## Basic Usage

```typescript
import { Suspense } from 'react'

function UserProfile({ userId }: { userId: string }) {
  const { data } = getUser.useSuspense({ urlParams: { userId } })

  return <div>{data.name}</div>
}

function App() {
  return (
    <ErrorBoundary fallback={<div>Error!</div>}>
      <Suspense fallback={<div>Loading...</div>}>
        <UserProfile userId="123" />
      </Suspense>
    </ErrorBoundary>
  )
}
```

`useSuspense(args, options?)` accepts every `useSuspenseQuery` option except `queryKey` and `queryFn`:

```typescript
const { data: name } = getUser.useSuspense(
  { urlParams: { userId } },
  { staleTime: 60_000, select: (user) => user.name },
)
```

## Error Boundaries

The value thrown to the boundary is the endpoint's `EndpointError`. Use `isEndpointError` / `isHttpError` from `@navios/builder` to narrow it, since a boundary receives `unknown`:

```typescript
import { isEndpointError, isHttpError } from '@navios/builder'
import { QueryErrorResetBoundary } from '@tanstack/react-query'
import { ErrorBoundary } from 'react-error-boundary'

function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: unknown
  resetErrorBoundary: () => void
}) {
  if (isHttpError(error, 404)) return <div>Not found</div>
  if (isEndpointError(error) && error.kind === 'network') {
    return (
      <div>
        <p>You appear to be offline</p>
        <button onClick={resetErrorBoundary}>Try again</button>
      </div>
    )
  }

  return (
    <div>
      <p>Something went wrong</p>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  )
}

function App() {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary FallbackComponent={ErrorFallback} onReset={reset}>
          <Suspense fallback={<div>Loading...</div>}>
            <UserProfile userId="123" />
          </Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  )
}
```

## Multiple Queries

Several `useSuspense()` calls in one component run one after another: the second starts when the first has resolved.

```typescript
function UserDashboard({ userId }: { userId: string }) {
  const { data: user } = getUser.useSuspense({ urlParams: { userId } })
  const { data: posts } = getUserPosts.useSuspense({ urlParams: { userId } })

  return (
    <div>
      <h1>{user.name}</h1>
      <PostsList posts={posts} />
    </div>
  )
}
```

To load in parallel, pass the query options to `useSuspenseQueries`:

```typescript
import { useSuspenseQueries } from '@tanstack/react-query'

function UserDashboard({ userId }: { userId: string }) {
  const [{ data: user }, { data: posts }] = useSuspenseQueries({
    queries: [getUser({ urlParams: { userId } }), getUserPosts({ urlParams: { userId } })],
  })
  // ...
}
```

Or prefetch before rendering:

```typescript
void getUser.prefetch(queryClient, { urlParams: { userId } })
void getUserPosts.prefetch(queryClient, { urlParams: { userId } })
```

## Nested Suspense

Separate boundaries let parts of a page appear independently:

```typescript
function UserPage({ userId }: { userId: string }) {
  return (
    <Suspense fallback={<div>Loading user...</div>}>
      <UserProfile userId={userId} />
      <Suspense fallback={<div>Loading posts...</div>}>
        <UserPosts userId={userId} />
      </Suspense>
    </Suspense>
  )
}
```

## Infinite Queries with Suspense

```typescript
function UserList() {
  const { data, fetchNextPage, hasNextPage } = listUsers.useSuspense({
    params: { limit: 20 },
  })

  return (
    <div>
      {data.pages.flatMap((page) =>
        page.users.map((user) => <div key={user.id}>{user.name}</div>),
      )}
      {hasNextPage && <button onClick={() => fetchNextPage()}>Load More</button>}
    </div>
  )
}
```

## Conditional Rendering

A suspense query always fetches: `useSuspense()` does not accept `skipToken` and has no `enabled` option. Render the component conditionally instead:

```typescript
function UserSection({ userId }: { userId: string | null }) {
  if (!userId) return <div>Select a user</div>

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UserProfile userId={userId} />
    </Suspense>
  )
}
```

## Best Practices

- **Pair every `Suspense` with an error boundary.** A failed suspense query throws.
- **Place boundaries around meaningful units** so a slow section does not blank the whole page.
- **Use skeletons as fallbacks** to avoid layout shifts.
- **Prefetch on the server or on hover** so the boundary rarely shows; see [SSR & Prefetching](/docs/builder/react-query/advanced/ssr-prefetch).

## Next Steps

- [Queries](/docs/builder/react-query/guides/queries) - The non-suspense hook
- [Typed Errors](/docs/builder/react-query/advanced/error-schemas) - Narrowing errors
- [SSR & Prefetching](/docs/builder/react-query/advanced/ssr-prefetch) - Fill the cache before rendering
