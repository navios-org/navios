import { isResponseEnvelope } from '@navios/builder'
import { queryOptions, useQuery, useSuspenseQuery } from '@tanstack/react-query'

import type {
  EndpointHandler,
  EndpointOptions,
  InferEndpointReturn,
  Simplify,
} from '@navios/builder'
import type {
  DataTag,
  QueryClient,
  UseQueryOptions,
  UseSuspenseQueryOptions,
} from '@tanstack/react-query'
import type { ZodObject, ZodType } from 'zod/v4'

import type { Split } from '../common/types.mjs'

import { createQueryKey } from './key-creator.mjs'

import type { QueryArgs, QueryHelpers, QueryResult, UnwrapMode } from './types.mjs'

/**
 * Options for makeQueryOptions.
 */
export interface MakeQueryOptionsParams<
  Options extends EndpointOptions,
  Result = QueryResult<Options>,
> {
  keyPrefix?: string[]
  keySuffix?: string[]
  onFail?: (err: unknown) => void
  processResponse?: (data: InferEndpointReturn<Options>) => Result
  /**
   * For endpoints declared with `result: 'envelope'`, controls how the
   * envelope is delivered to React Query.
   *
   * - `'none'` (default): the `ResponseEnvelope` is cached as-is. The
   *   React Query `error` channel is unused.
   * - `'throw-on-error'`: on `envelope.ok === false`, the `envelope.error`
   *   is thrown from the queryFn so the React Query `error` channel fires;
   *   on success, the unwrapped `envelope.data` becomes the cached data.
   *
   * Has no effect for non-envelope endpoints.
   */
  unwrap?: UnwrapMode
}

/**
 * Creates query options for a given endpoint.
 *
 * Returns a function that generates TanStack Query options when called with params.
 * The returned function also has helper methods attached (use, useSuspense, invalidate, etc.)
 *
 * Uses const generics pattern to automatically infer types from the endpoint configuration.
 *
 * @param endpoint - The navios endpoint handler (from builder's declareEndpoint)
 * @param options - Query configuration including processResponse
 * @param baseQuery - Optional base query options to merge
 * @returns A function that generates query options with attached helpers
 *
 * @example
 * ```ts
 * const getUser = api.declareEndpoint({
 *   method: 'GET',
 *   url: '/users/$userId',
 *   responseSchema: userSchema,
 * })
 *
 * const queryOptions = makeQueryOptions(getUser, {
 *   processResponse: (data) => data,
 * })
 *
 * const { data } = queryOptions.useSuspense({ urlParams: { userId: '123' } })
 * ```
 */
export function makeQueryOptions<
  const Options extends EndpointOptions,
  Result = QueryResult<Options>,
  BaseQuery extends Omit<
    UseQueryOptions<Result, Error, any>,
    | 'queryKey'
    | 'queryFn'
    | 'getNextPageParam'
    | 'initialPageParam'
    | 'enabled'
    | 'throwOnError'
    | 'placeholderData'
  > = Omit<
    UseQueryOptions<Result, Error, any>,
    | 'queryKey'
    | 'queryFn'
    | 'getNextPageParam'
    | 'initialPageParam'
    | 'enabled'
    | 'throwOnError'
    | 'placeholderData'
  >,
>(
  endpoint: EndpointHandler<Options>,
  options: MakeQueryOptionsParams<Options, Result>,
  baseQuery?: BaseQuery,
): ((
  params: Simplify<
    QueryArgs<
      Options['url'],
      Options extends { querySchema: infer Q extends ZodObject } ? Q : undefined,
      Options extends { requestSchema: infer R extends ZodType } ? R : undefined
    >
  >,
) => UseSuspenseQueryOptions<
  Result,
  Error,
  BaseQuery extends { select: (...args: any[]) => infer T } ? T : Result,
  DataTag<Split<Options['url'], '/'>, Result, Error>
>) &
  QueryHelpers<
    Options['url'],
    Options extends { querySchema: infer Q extends ZodObject } ? Q : undefined,
    Result,
    false,
    Options extends { requestSchema: infer R extends ZodType } ? R : undefined
  > {
  const config = endpoint.config
  const queryKey = createQueryKey(config as any, options as any, false)
  const processResponse =
    options.processResponse ?? ((data: InferEndpointReturn<Options>) => data as unknown as Result)

  const result = (
    params: Simplify<
      QueryArgs<
        Options['url'],
        Options extends { querySchema: infer Q extends ZodObject } ? Q : undefined,
        Options extends { requestSchema: infer R extends ZodType } ? R : undefined
      >
    >,
  ): any => {
    return queryOptions({
      queryKey: queryKey.dataTag(params as any),
      queryFn: async ({ signal }): Promise<Result> => {
        let result
        try {
          result = await endpoint({
            signal,
            ...params,
          } as any)
        } catch (err) {
          if (options.onFail) {
            options.onFail(err)
          }
          throw err
        }

        if ((options.unwrap ?? 'none') === 'throw-on-error' && isResponseEnvelope(result)) {
          if (!result.ok) {
            if (options.onFail) {
              options.onFail(result.error)
            }
            throw result.error
          }
          return processResponse(result.data as never)
        }

        return processResponse(result)
      },
      ...baseQuery,
    })
  }

  /** The query key creator for this endpoint */
  result.queryKey = queryKey as any

  /**
   * React hook that executes the query.
   * Uses `useQuery` from TanStack Query internally.
   *
   * @param params - URL parameters, query parameters, and request body
   * @returns Query result with data, isLoading, error, etc.
   */
  result.use = (params: any) => {
    return useQuery(result(params))
  }

  /**
   * React hook that executes the query with Suspense support.
   * Uses `useSuspenseQuery` from TanStack Query internally.
   * The component will suspend while loading and throw on error.
   *
   * @param params - URL parameters, query parameters, and request body
   * @returns Query result with data guaranteed to be defined
   */
  result.useSuspense = (params: any) => {
    return useSuspenseQuery(result(params))
  }

  /**
   * Creates a function that invalidates a specific query in the cache.
   * Call the returned function to trigger the invalidation.
   *
   * @param queryClient - The TanStack Query client instance
   * @param params - The exact parameters used for this query
   * @returns A function that when called invalidates the query
   *
   * @example
   * ```ts
   * const invalidate = getUser.invalidate(queryClient, { urlParams: { userId: '123' } })
   * await invalidate() // Invalidates this specific query
   * ```
   */
  result.invalidate = (queryClient: QueryClient, params: any) => {
    return () =>
      queryClient.invalidateQueries({
        queryKey: result.queryKey.dataTag(params),
      })
  }

  /**
   * Creates a function that invalidates all queries matching the URL pattern.
   * Useful for invalidating all queries for a resource regardless of query params.
   *
   * @param queryClient - The TanStack Query client instance
   * @param params - URL parameters only (query params are ignored for matching)
   * @returns A function that when called invalidates all matching queries
   *
   * @example
   * ```ts
   * const invalidateAll = getUserPosts.invalidateAll(queryClient, { urlParams: { userId: '123' } })
   * await invalidateAll() // Invalidates all getUserPosts queries for user 123
   * ```
   */
  result.invalidateAll = (queryClient: QueryClient, params: any) => {
    return () =>
      queryClient.invalidateQueries({
        queryKey: result.queryKey.filterKey(params),
        exact: false,
      })
  }

  return result as unknown as ((
    params: Simplify<
      QueryArgs<
        Options['url'],
        Options extends { querySchema: infer Q extends ZodObject } ? Q : undefined,
        Options extends { requestSchema: infer R extends ZodType } ? R : undefined
      >
    >,
  ) => UseSuspenseQueryOptions<
    Result,
    Error,
    BaseQuery extends { select: (...args: any[]) => infer T } ? T : Result,
    DataTag<Split<Options['url'], '/'>, Result, Error>
  >) &
    QueryHelpers<
      Options['url'],
      Options extends { querySchema: infer Q extends ZodObject } ? Q : undefined,
      Result,
      false,
      Options extends { requestSchema: infer R extends ZodType } ? R : undefined
    >
}
