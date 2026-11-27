---
title: Infinite queries
---

# Infinite queries

`client.infiniteQuery` is for lists that load page by page: "load more" buttons, endless scroll, cursors. It wraps TanStack's `useInfiniteQuery` and takes care of the one thing that is specific to an endpoint: turning a page param into a request.

## Declare one

The endpoint must have a `querySchema`, because the page param is a set of query parameters. `getNextPageParam` returns the query parameters for the next page, or `undefined` when there is none.

```ts
// client from the React Query quick start
const postSchema = z.object({ id: z.string(), title: z.string() })

export const postsQuery = client.infiniteQuery({
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
  getNextPageParam: (lastPage) =>
    lastPage.nextCursor ? { cursor: lastPage.nextCursor } : undefined,
})
```

With an existing endpoint, the pagination settings are the second argument: `client.infiniteQuery(listPosts, { getNextPageParam })`.

The same object takes `useInfiniteQuery` options for every use of the query, such as `staleTime` or `maxPages`, as [queries do](/docs/builder/react-query/queries#options-for-every-use).

## Use it

```tsx
function PostList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = postsQuery.use({
    params: { limit: 20 },
  })

  return (
    <>
      {data?.pages.flatMap((page) =>
        page.posts.map((post) => <article key={post.id}>{post.title}</article>),
      )}
      {hasNextPage && (
        <button disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
          Load more
        </button>
      )}
    </>
  )
}
```

`data` is TanStack's `InfiniteData`: `pages` holds each validated response and `pageParams` the param that produced it. The hook result and its options are TanStack's; see [Infinite Queries](https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries) for `maxPages`, `select` and the rest.

## How a page is requested

Each page calls the endpoint with the page param merged over the `params` you passed to the hook:

```ts
postsQuery.use({ params: { limit: 20 } })

// first page   GET /posts?limit=20
// second page  GET /posts?limit=20&cursor=abc
```

So `getNextPageParam` only returns what changes, and is typed that way: any subset of the query parameters. Filters and page size stay in the hook's `params` and are part of the cache key; the page param is not.

The `lastPageParam` it receives is the whole query of the last page: the page param merged over the hook's `params`. `data.pageParams` holds the page params as they were returned.

The first page param is the hook's `params`, exactly as you passed them. They are not run through `querySchema` first, so a schema default does not show up in `lastPageParam`. Set `initialPageParam` when the first page needs something else.

## Page numbers

`getNextPageParam` receives four arguments: the last page, all pages, the last page param and all page params. For numbered pages, count from the last param:

```ts
// listUsers from "URL params, query and body"
export const usersFeedQuery = client.infiniteQuery(listUsers, {
  initialPageParam: { page: 1 },
  getNextPageParam: (lastPage, _pages, lastPageParam) =>
    lastPage.length > 0 ? { page: (lastPageParam.page ?? 1) + 1 } : undefined,
})
```

For lists that load in both directions, add `getPreviousPageParam` with the same shape and use `fetchPreviousPage` from the hook result. `initialPageParam` is a subset of the query parameters as well.

## Helpers and cache entries

An infinite query has every member a [query](/docs/builder/react-query/queries) has: `use`, `useSuspense`, the options call, `key`, `fetch`, `prefetch`, `ensure`, `getData`, `setData` and `invalidate`. The differences:

- The cached value is `InfiniteData`, so `setData` updaters receive `{ pages, pageParams }`.
- `fetch`, `prefetch` and `ensure` load the first page.
- `withResponse: true` wraps every page as `{ data, response }`.

```ts
postsQuery.setData(queryClient, { params: { limit: 20 } }, (current) =>
  current && {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      posts: page.posts.filter((post) => post.id !== removedId),
    })),
  },
)
```

Infinite entries are stored apart from plain ones. You can declare `client.query` and `client.infiniteQuery` on the same endpoint and neither overwrites the other; the key of the infinite form is marked `'infinite'` and that of the plain form `'query'`.

Related: [Keys and invalidation](/docs/builder/react-query/keys-and-invalidation).
