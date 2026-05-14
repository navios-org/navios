import { isResponseEnvelope } from '@navios/builder'
import {
  infiniteQueryOptions,
  useInfiniteQuery,
  useSuspenseInfiniteQuery,
} from '@tanstack/react-query'

import type { EndpointHandler, EndpointOptions, UrlParams } from '@navios/builder'
import type {
  InfiniteData,
  QueryClient,
  UseInfiniteQueryOptions,
  UseSuspenseInfiniteQueryOptions,
} from '@tanstack/react-query'
import type { z, ZodObject } from 'zod/v4'

import { createQueryKey } from './key-creator.mjs'

import type { InfiniteQueryOptions, QueryArgs } from './types.mjs'

/**
 * Creates infinite query options for a given endpoint.
 *
 * Returns a function that generates TanStack Query infinite options when called with params.
 * The returned function also has helper methods attached (use, useSuspense, invalidate, etc.)
 *
 * @param endpoint - The navios endpoint to create infinite query options for
 * @param options - Infinite query configuration including pagination params
 * @param baseQuery - Optional base query options to merge
 * @returns A function that generates infinite query options with attached helpers
 */
export function makeInfiniteQueryOptions<
  Config extends EndpointOptions & { querySchema: ZodObject },
  Options extends InfiniteQueryOptions<Config> = InfiniteQueryOptions<Config>,
  PageResult = z.output<Config['responseSchema']>,
  BaseQuery extends Omit<
    UseInfiniteQueryOptions<PageResult, Error, any>,
    | 'queryKey'
    | 'queryFn'
    | 'getNextPageParam'
    | 'initialPageParam'
    | 'placeholderData'
    | 'throwOnError'
  > = Omit<
    UseInfiniteQueryOptions<PageResult, Error, any>,
    | 'queryKey'
    | 'queryFn'
    | 'getNextPageParam'
    | 'initialPageParam'
    | 'placeholderData'
    | 'throwOnError'
  >,
>(endpoint: EndpointHandler<Config>, options: Options, baseQuery: BaseQuery = {} as BaseQuery) {
  const config = endpoint.config
  const queryKey = createQueryKey(config as any, options as any, true)

  const unwrapMode = options.unwrap ?? 'none'
  const shouldUnwrap = unwrapMode === 'throw-on-error' || unwrapMode === 'pages'
  const res = (
    params: QueryArgs<Config['url'], Config['querySchema']>,
  ): UseSuspenseInfiniteQueryOptions<
    PageResult,
    Error,
    BaseQuery['select'] extends (...args: any[]) => infer T ? T : InfiniteData<PageResult>
  > => {
    return infiniteQueryOptions<any, any, any, any, any>({
      // @ts-expect-error TS2345 We bind the url params only if the url has params
      queryKey: queryKey.dataTag(params),
      queryFn: async ({ signal, pageParam }): Promise<PageResult> => {
        const callParams = params as {
          urlParams?: z.infer<UrlParams<Config['url']>>
          params?: Record<string, unknown>
        }
        const result = await endpoint({
          signal,
          urlParams: callParams.urlParams,
          params: {
            ...callParams.params,
            ...(pageParam as z.infer<Config['querySchema']>),
          },
        } as any)

        if (shouldUnwrap && isResponseEnvelope(result)) {
          const envelope = result as { ok: boolean; data?: unknown; error?: unknown }
          if (!envelope.ok) {
            throw envelope.error
          }
          return envelope.data as PageResult
        }

        return result as PageResult
      },
      getNextPageParam: options.getNextPageParam,
      getPreviousPageParam: options.getPreviousPageParam,
      initialPageParam:
        options.initialPageParam ??
        config.querySchema?.parse('params' in params ? params.params : {}) ??
        ('params' in params ? params.params : {}),
      ...baseQuery,
    })
  }
  /** The query key creator for this infinite query endpoint */
  res.queryKey = queryKey

  /**
   * React hook that executes the infinite query.
   * Uses `useInfiniteQuery` from TanStack Query internally.
   *
   * @param params - URL parameters and initial query parameters
   * @param opts - Optional per-call options (currently `select` only). The
   *   transform receives `InfiniteData<PageResult>`. A per-call `select`
   *   overrides any construction-time `baseQuery.select`.
   * @returns Infinite query result with pages, fetchNextPage, etc.
   */
  function useHook<TSelected = InfiniteData<PageResult>>(
    params: QueryArgs<Config['url'], Config['querySchema']>,
    opts?: { select?: (data: InfiniteData<PageResult>) => TSelected },
  ) {
    return useInfiniteQuery({ ...res(params), ...opts } as any) as ReturnType<
      typeof useInfiniteQuery<PageResult, Error, TSelected>
    >
  }
  res.use = useHook

  /**
   * React hook that executes the infinite query with Suspense support.
   * Uses `useSuspenseInfiniteQuery` from TanStack Query internally.
   * The component will suspend while loading and throw on error.
   *
   * @param params - URL parameters and initial query parameters
   * @param opts - Optional per-call options (currently `select` only). The
   *   transform receives `InfiniteData<PageResult>`. A per-call `select`
   *   overrides any construction-time `baseQuery.select`.
   * @returns Infinite query result with pages guaranteed to be defined
   */
  function useSuspenseHook<TSelected = InfiniteData<PageResult>>(
    params: QueryArgs<Config['url'], Config['querySchema']>,
    opts?: { select?: (data: InfiniteData<PageResult>) => TSelected },
  ) {
    return useSuspenseInfiniteQuery({ ...res(params), ...opts } as any) as ReturnType<
      typeof useSuspenseInfiniteQuery<PageResult, Error, TSelected>
    >
  }
  res.useSuspense = useSuspenseHook

  /**
   * Creates a function that invalidates this specific infinite query in the cache.
   * Call the returned function to trigger the invalidation.
   *
   * @param queryClient - The TanStack Query client instance
   * @param params - The exact parameters used for this query
   * @returns A function that when called invalidates the query
   */
  res.invalidate = (
    queryClient: QueryClient,
    params: QueryArgs<Config['url'], Config['querySchema']>,
  ) => {
    return () =>
      queryClient.invalidateQueries({
        // @ts-expect-error TS2345 We bind the url params only if the url has params
        queryKey: res.queryKey.dataTag(params),
      })
  }

  /**
   * Creates a function that invalidates all infinite queries matching the URL pattern.
   * Useful for invalidating all queries for a resource regardless of query params.
   *
   * @param queryClient - The TanStack Query client instance
   * @param params - URL parameters only (query params are ignored for matching)
   * @returns A function that when called invalidates all matching queries
   */
  res.invalidateAll = (
    queryClient: QueryClient,
    params: QueryArgs<Config['url'], Config['querySchema']>,
  ) => {
    return () =>
      queryClient.invalidateQueries({
        // @ts-expect-error TS2345 We bind the url params only if the url has params
        queryKey: res.queryKey.filterKey(params),
        exact: false,
      })
  }

  return res
}
