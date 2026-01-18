import type { FetchQueryOptions, QueryClient, QueryKey } from '@tanstack/react-query'

/**
 * Type for a query options creator function that returns TanStack Query options.
 *
 * This matches the return type of `client.query()` from the navios react-query client.
 */
export type QueryOptionsCreator<TParams, TData, TError = Error> = (
  params: TParams,
) => FetchQueryOptions<TData, TError, TData, QueryKey>

/**
 * Helper utilities for prefetching queries.
 *
 * @template TParams - The query parameters type
 * @template TData - The query data type
 * @template TError - The error type (defaults to Error)
 */
export interface PrefetchHelper<TParams, TData, TError = Error> {
  /**
   * Prefetch query data on the server.
   *
   * Use this in server components or getServerSideProps to
   * prefetch data before rendering.
   *
   * @param queryClient - The QueryClient instance
   * @param params - Parameters for the query
   * @returns Promise that resolves when prefetch is complete
   *
   * @example
   * ```tsx
   * // In a Next.js Server Component
   * const queryClient = new QueryClient()
   * await prefetch.prefetch(queryClient, { urlParams: { userId: '1' } })
   * return (
   *   <HydrationBoundary state={dehydrate(queryClient)}>
   *     <UserProfile userId="1" />
   *   </HydrationBoundary>
   * )
   * ```
   */
  prefetch: (queryClient: QueryClient, params: TParams) => Promise<void>

  /**
   * Ensure query data exists in cache. Fetches only if not cached.
   *
   * Returns the cached or fetched data.
   *
   * @param queryClient - The QueryClient instance
   * @param params - Parameters for the query
   * @returns Promise that resolves to the query data
   *
   * @example
   * ```tsx
   * // Ensure data exists before rendering
   * const userData = await prefetch.ensureData(queryClient, {
   *   urlParams: { userId: '1' },
   * })
   * console.log('User:', userData.name)
   * ```
   */
  ensureData: (queryClient: QueryClient, params: TParams) => Promise<TData>

  /**
   * Get the query options for a given set of parameters.
   *
   * Useful for advanced use cases or when you need to
   * customize the prefetch behavior.
   *
   * @param params - Parameters for the query
   * @returns The query options object
   *
   * @example
   * ```tsx
   * const options = prefetch.getQueryOptions({ urlParams: { userId: '1' } })
   * await queryClient.prefetchQuery({
   *   ...options,
   *   staleTime: 60000, // Override stale time for prefetch
   * })
   * ```
   */
  getQueryOptions: (params: TParams) => FetchQueryOptions<TData, TError, TData, QueryKey>

  /**
   * Prefetch multiple queries in parallel.
   *
   * @param queryClient - The QueryClient instance
   * @param paramsList - Array of parameters for multiple queries
   * @returns Promise that resolves when all prefetches complete
   *
   * @example
   * ```tsx
   * // Prefetch multiple users in parallel
   * await prefetch.prefetchMany(queryClient, [
   *   { urlParams: { userId: '1' } },
   *   { urlParams: { userId: '2' } },
   *   { urlParams: { userId: '3' } },
   * ])
   * ```
   */
  prefetchMany: (queryClient: QueryClient, paramsList: TParams[]) => Promise<void>
}

/**
 * Creates a type-safe prefetch helper for SSR/RSC.
 *
 * This utility wraps a query options creator to provide convenient
 * methods for server-side data fetching and hydration.
 *
 * @param queryOptionsCreator - A function that creates query options (from client.query())
 * @returns A prefetch helper object with prefetch, ensureData, and getQueryOptions methods
 *
 * @example
 * ```tsx
 * // 1. Create your query
 * const getUserQuery = client.query({
 *   method: 'GET',
 *   url: '/users/$userId',
 *   responseSchema: userSchema,
 * })
 *
 * // 2. Create prefetch helper
 * const userPrefetch = createPrefetchHelper(getUserQuery)
 *
 * // 3. Use in server component
 * async function UserPage({ userId }: { userId: string }) {
 *   const queryClient = new QueryClient()
 *
 *   await userPrefetch.prefetch(queryClient, {
 *     urlParams: { userId },
 *   })
 *
 *   return (
 *     <HydrationBoundary state={dehydrate(queryClient)}>
 *       <UserProfile userId={userId} />
 *     </HydrationBoundary>
 *   )
 * }
 * ```
 *
 * @example
 * ```tsx
 * // With Next.js App Router
 * import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
 * import { createPrefetchHelper } from '@navios/react-query'
 *
 * // Define queries
 * const getPostsQuery = client.query({
 *   method: 'GET',
 *   url: '/posts',
 *   querySchema: z.object({ page: z.number() }),
 *   responseSchema: postsSchema,
 * })
 *
 * const postsPrefetch = createPrefetchHelper(getPostsQuery)
 *
 * // Server Component
 * export default async function PostsPage() {
 *   const queryClient = new QueryClient()
 *
 *   await postsPrefetch.prefetch(queryClient, {
 *     params: { page: 1 },
 *   })
 *
 *   return (
 *     <HydrationBoundary state={dehydrate(queryClient)}>
 *       <PostsList />
 *     </HydrationBoundary>
 *   )
 * }
 * ```
 */
export function createPrefetchHelper<TParams, TData, TError = Error>(
  queryOptionsCreator: QueryOptionsCreator<TParams, TData, TError>,
): PrefetchHelper<TParams, TData, TError> {
  return {
    prefetch: async (queryClient: QueryClient, params: TParams) => {
      const options = queryOptionsCreator(params)
      await queryClient.prefetchQuery(options)
    },

    ensureData: async (queryClient: QueryClient, params: TParams) => {
      const options = queryOptionsCreator(params)
      return queryClient.ensureQueryData(options)
    },

    getQueryOptions: (params: TParams) => {
      return queryOptionsCreator(params)
    },

    prefetchMany: async (queryClient: QueryClient, paramsList: TParams[]) => {
      await Promise.all(
        paramsList.map((params) => {
          const options = queryOptionsCreator(params)
          return queryClient.prefetchQuery(options)
        }),
      )
    },
  }
}

/**
 * Creates multiple prefetch helpers from a record of query options creators.
 *
 * Useful when you have multiple queries that need to be prefetched together.
 *
 * @param queries - Record of query options creator functions
 * @returns Record of prefetch helpers with the same keys
 *
 * @example
 * ```tsx
 * // Define all your queries
 * const queries = {
 *   user: client.query({
 *     method: 'GET',
 *     url: '/users/$userId',
 *     responseSchema: userSchema,
 *   }),
 *   posts: client.query({
 *     method: 'GET',
 *     url: '/users/$userId/posts',
 *     responseSchema: postsSchema,
 *   }),
 * }
 *
 * // Create all prefetch helpers at once
 * const prefetchers = createPrefetchHelpers(queries)
 *
 * // Use in server component
 * async function UserPage({ userId }: { userId: string }) {
 *   const queryClient = new QueryClient()
 *
 *   await Promise.all([
 *     prefetchers.user.prefetch(queryClient, { urlParams: { userId } }),
 *     prefetchers.posts.prefetch(queryClient, { urlParams: { userId } }),
 *   ])
 *
 *   return (
 *     <HydrationBoundary state={dehydrate(queryClient)}>
 *       <UserProfileWithPosts userId={userId} />
 *     </HydrationBoundary>
 *   )
 * }
 * ```
 */
export function createPrefetchHelpers<T extends Record<string, QueryOptionsCreator<any, any, any>>>(
  queries: T,
): {
  [K in keyof T]: T[K] extends QueryOptionsCreator<infer TParams, infer TData, infer TError>
    ? PrefetchHelper<TParams, TData, TError>
    : never
} {
  const result = {} as {
    [K in keyof T]: T[K] extends QueryOptionsCreator<infer TParams, infer TData, infer TError>
      ? PrefetchHelper<TParams, TData, TError>
      : never
  }

  for (const key of Object.keys(queries) as Array<keyof T>) {
    // @ts-expect-error - TypeScript can't infer this properly
    result[key] = createPrefetchHelper(queries[key])
  }

  return result
}

/**
 * Prefetch multiple queries from different query creators in parallel.
 *
 * @param queryClient - The QueryClient instance
 * @param prefetches - Array of { helper, params } objects
 * @returns Promise that resolves when all prefetches complete
 *
 * @example
 * ```tsx
 * const userPrefetch = createPrefetchHelper(getUserQuery)
 * const postsPrefetch = createPrefetchHelper(getPostsQuery)
 *
 * async function DashboardPage({ userId }: { userId: string }) {
 *   const queryClient = new QueryClient()
 *
 *   await prefetchAll(queryClient, [
 *     { helper: userPrefetch, params: { urlParams: { userId } } },
 *     { helper: postsPrefetch, params: { urlParams: { userId }, params: { limit: 10 } } },
 *   ])
 *
 *   return (
 *     <HydrationBoundary state={dehydrate(queryClient)}>
 *       <Dashboard userId={userId} />
 *     </HydrationBoundary>
 *   )
 * }
 * ```
 */
export async function prefetchAll(
  queryClient: QueryClient,
  prefetches: Array<{
    helper: PrefetchHelper<any, any, any>
    params: unknown
  }>,
): Promise<void> {
  await Promise.all(prefetches.map(({ helper, params }) => helper.prefetch(queryClient, params)))
}
