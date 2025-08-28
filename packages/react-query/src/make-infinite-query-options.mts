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

import type { InfiniteQueryOptions } from './types.mjs'
import type { ClientQueryArgs } from './types/index.mjs'

import { queryKeyCreator } from './utils/query-key-creator.mjs'

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
  const queryKey = queryKeyCreator(config, options, true)

  const processResponse = options.processResponse
  const res = (
    params: ClientQueryArgs,
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
      // @ts-expect-error TS2322 We know the type
      queryKey: queryKey.dataTag(params),
      queryFn: async ({ signal, pageParam }) => {
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

        return processResponse(result)
      },
      getNextPageParam: options.getNextPageParam,
      initialPageParam:
        options.initialPageParam ??
        config.querySchema.parse('params' in params ? params.params : {}),
      ...baseQuery,
    })
  }
  res.queryKey = queryKey

  res.use = (params: ClientQueryArgs) => {
    return useInfiniteQuery(res(params))
  }

  res.useSuspense = (params: ClientQueryArgs) => {
    return useSuspenseInfiniteQuery(res(params))
  }

  res.invalidate = (queryClient: QueryClient, params: ClientQueryArgs) => {
    return queryClient.invalidateQueries({
      // @ts-expect-error We add additional function to the result
      queryKey: res.queryKey.dataTag(params),
    })
  }

  res.invalidateAll = (queryClient: QueryClient, params: ClientQueryArgs) => {
    return queryClient.invalidateQueries({
      // @ts-expect-error We add additional function to the result
      queryKey: res.queryKey.filterKey(params),
      exact: false,
    })
  }

  return res
}
