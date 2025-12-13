import type {
  AbstractEndpoint,
  AnyEndpointConfig,
  UrlParams,
} from '@navios/builder'
import type {
  InfiniteData,
  QueryClient,
  UseInfiniteQueryOptions,
  UseSuspenseInfiniteQueryOptions,
} from '@tanstack/react-query'
import type { z } from 'zod/v4'

import {
  infiniteQueryOptions,
  useInfiniteQuery,
  useSuspenseInfiniteQuery,
} from '@tanstack/react-query'

import type { InfiniteQueryOptions, QueryArgs } from './types.mjs'

import { createQueryKey } from './key-creator.mjs'

/**
 * Creates infinite query options for a given endpoint.
 *
 * Returns a function that generates TanStack Query infinite options when called with params.
 * The returned function also has helper methods attached (use, useSuspense, invalidate, etc.)
 *
 * @param endpoint - The navios endpoint to create infinite query options for
 * @param options - Infinite query configuration including processResponse and pagination params
 * @param baseQuery - Optional base query options to merge
 * @returns A function that generates infinite query options with attached helpers
 */
export function makeInfiniteQueryOptions<
  Config extends AnyEndpointConfig,
  Options extends InfiniteQueryOptions<Config>,
  BaseQuery extends Omit<
    UseInfiniteQueryOptions<ReturnType<Options['processResponse']>, Error, any>,
    | 'queryKey'
    | 'queryFn'
    | 'getNextPageParam'
    | 'initialPageParam'
    | 'placeholderData'
    | 'throwOnError'
  >,
>(
  endpoint: AbstractEndpoint<Config>,
  options: Options,
  baseQuery: BaseQuery = {} as BaseQuery,
) {
  const config = endpoint.config
  const queryKey = createQueryKey(config, options, true)

  const processResponse = options.processResponse
  const res = (
    params: QueryArgs<Config['url'], Config['querySchema']>,
  ): Options['processResponse'] extends (...args: any[]) => infer Result
    ? UseSuspenseInfiniteQueryOptions<
        Result,
        Error,
        BaseQuery['select'] extends (...args: any[]) => infer T
          ? T
          : InfiniteData<Result>
      >
    : never => {
    // @ts-expect-error TS2322 We know that the processResponse is defined
    return infiniteQueryOptions({
      queryKey: queryKey.dataTag(params),
      queryFn: async ({ signal, pageParam }): Promise<ReturnType<Options['processResponse']>> => {
        let result
        try {
          result = await endpoint({
            signal,
            // @ts-expect-error TS2345 We bind the url params only if the url has params
            urlParams: params.urlParams as z.infer<UrlParams<Config['url']>>,
            params: {
              ...('params' in params ? params.params : {}),
              ...(pageParam as z.infer<Config['querySchema']>),
            },
          })
        } catch (err) {
          if (options.onFail) {
            options.onFail(err)
          }
          throw err
        }

        return processResponse(result) as ReturnType<Options['processResponse']>
      },
      getNextPageParam: options.getNextPageParam,
      getPreviousPageParam: options.getPreviousPageParam,
      initialPageParam:
        options.initialPageParam ??
        config.querySchema.parse('params' in params ? params.params : {}),
      ...baseQuery,
    })
  }
  res.queryKey = queryKey

  res.use = (params: QueryArgs<Config['url'], Config['querySchema']>) => {
    return useInfiniteQuery(res(params))
  }

  res.useSuspense = (params: QueryArgs<Config['url'], Config['querySchema']>) => {
    return useSuspenseInfiniteQuery(res(params))
  }

  res.invalidate = (
    queryClient: QueryClient,
    params: QueryArgs<Config['url'], Config['querySchema']>,
  ) => {
    return queryClient.invalidateQueries({
      queryKey: res.queryKey.dataTag(params),
    })
  }

  res.invalidateAll = (
    queryClient: QueryClient,
    params: QueryArgs<Config['url'], Config['querySchema']>,
  ) => {
    return queryClient.invalidateQueries({
      queryKey: res.queryKey.filterKey(params),
      exact: false,
    })
  }

  return res
}
