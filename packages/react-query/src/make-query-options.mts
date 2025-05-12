import type { AbstractEndpoint, AnyEndpointConfig } from '@navios/common'
import type {
  DataTag,
  QueryClient,
  UseQueryOptions,
  UseSuspenseQueryOptions,
} from '@tanstack/react-query'

import { queryOptions, useQuery, useSuspenseQuery } from '@tanstack/react-query'

import type { BaseQueryArgs, BaseQueryParams } from './types.mjs'
import type { ClientQueryArgs } from './types/index.mjs'

import { queryKeyCreator } from './utils/query-key-creator.mjs'

type Split<S extends string, D extends string> = string extends S
  ? string[]
  : S extends ''
    ? []
    : S extends `${infer T}${D}${infer U}`
      ? [T, ...Split<U, D>]
      : [S]

export function makeQueryOptions<
  Config extends AnyEndpointConfig,
  Options extends BaseQueryParams<Config>,
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
  // Let's hack the url to be a string for now
  const queryKey = queryKeyCreator(config, options, false)
  const processResponse = options.processResponse

  const result = (
    params: BaseQueryArgs<Config>,
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
      queryFn: async ({ signal }) => {
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

        return processResponse(result)
      },
      ...baseQuery,
    })
  }
  result.queryKey = queryKey
  result.use = (params: ClientQueryArgs) => {
    // @ts-expect-error We add additional function to the result
    return useQuery(result(params))
  }

  result.useSuspense = (params: ClientQueryArgs) => {
    // @ts-expect-error We add additional function to the result
    return useSuspenseQuery(result(params))
  }

  result.invalidate = (queryClient: QueryClient, params: ClientQueryArgs) => {
    return queryClient.invalidateQueries({
      // @ts-expect-error We add additional function to the result
      queryKey: result.queryKey.dataTag(params),
    })
  }

  result.invalidateAll = (
    queryClient: QueryClient,
    params: ClientQueryArgs,
  ) => {
    return queryClient.invalidateQueries({
      // @ts-expect-error We add additional function to the result
      queryKey: result.queryKey.filterKey(params),
      exact: false,
    })
  }

  return result
}
