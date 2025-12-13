import type { AbstractEndpoint, AnyEndpointConfig } from '@navios/builder'
import type {
  DataTag,
  QueryClient,
  UseQueryOptions,
  UseSuspenseQueryOptions,
} from '@tanstack/react-query'

import { queryOptions, useQuery, useSuspenseQuery } from '@tanstack/react-query'

import type { Split } from '../common/types.mjs'
import type { QueryArgs, QueryParams } from './types.mjs'

import { createQueryKey } from './key-creator.mjs'

/**
 * Creates query options for a given endpoint.
 *
 * Returns a function that generates TanStack Query options when called with params.
 * The returned function also has helper methods attached (use, useSuspense, invalidate, etc.)
 *
 * @param endpoint - The navios endpoint to create query options for
 * @param options - Query configuration including processResponse
 * @param baseQuery - Optional base query options to merge
 * @returns A function that generates query options with attached helpers
 */
export function makeQueryOptions<
  Config extends AnyEndpointConfig,
  Options extends QueryParams<Config>,
  BaseQuery extends Omit<
    UseQueryOptions<ReturnType<Options['processResponse']>, Error, any>,
    | 'queryKey'
    | 'queryFn'
    | 'getNextPageParam'
    | 'initialPageParam'
    | 'enabled'
    | 'throwOnError'
    | 'placeholderData'
  >,
>(
  endpoint: AbstractEndpoint<Config>,
  options: Options,
  baseQuery: BaseQuery = {} as BaseQuery,
) {
  const config = endpoint.config
  const queryKey = createQueryKey(config, options, false)
  const processResponse = options.processResponse

  const result = (
    params: QueryArgs<Config['url'], Config['querySchema']>,
  ): Options['processResponse'] extends (...args: any[]) => infer Result
    ? UseSuspenseQueryOptions<
        Result,
        Error,
        BaseQuery['select'] extends (...args: any[]) => infer T ? T : Result,
        DataTag<Split<Config['url'], '/'>, Result, Error>
      >
    : never => {
    // @ts-expect-error TS2322 We know that the processResponse is defined
    return queryOptions({
      queryKey: queryKey.dataTag(params),
      queryFn: async ({ signal }): Promise<ReturnType<Options['processResponse']>> => {
        let result
        try {
          result = await endpoint({
            signal,
            ...params,
          })
        } catch (err) {
          if (options.onFail) {
            options.onFail(err)
          }
          throw err
        }

        return processResponse(result) as ReturnType<Options['processResponse']>
      },
      ...baseQuery,
    })
  }
  result.queryKey = queryKey
  result.use = (params: QueryArgs<Config['url'], Config['querySchema']>) => {
    return useQuery(result(params))
  }

  result.useSuspense = (params: QueryArgs<Config['url'], Config['querySchema']>) => {
    return useSuspenseQuery(result(params))
  }

  result.invalidate = (
    queryClient: QueryClient,
    params: QueryArgs<Config['url'], Config['querySchema']>,
  ) => {
    return queryClient.invalidateQueries({
      queryKey: result.queryKey.dataTag(params),
    })
  }

  result.invalidateAll = (
    queryClient: QueryClient,
    params: QueryArgs<Config['url'], Config['querySchema']>,
  ) => {
    return queryClient.invalidateQueries({
      queryKey: result.queryKey.filterKey(params),
      exact: false,
    })
  }

  return result
}
