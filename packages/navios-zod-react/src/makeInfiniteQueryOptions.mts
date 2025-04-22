import type {
  EndpointConfig,
  RequiredRequestEndpoint,
  UrlParams,
} from '@navios/navios-zod'
import type {
  InfiniteData,
  UseInfiniteQueryOptions,
  UseSuspenseInfiniteQueryOptions,
} from '@tanstack/react-query'
import type { z } from 'zod'

import { infiniteQueryOptions } from '@tanstack/react-query'

import type { BaseQueryArgs, InfiniteQueryOptions } from './types.mjs'

import { queryKeyCreator } from './utils/query-key-creator.mjs'

type Split<S extends string, D extends string> = string extends S
  ? string[]
  : S extends ''
    ? []
    : S extends `${infer T}${D}${infer U}`
      ? [T, ...Split<U, D>]
      : [S]

export function makeInfiniteQueryOptions<
  Config extends Required<EndpointConfig>,
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
  endpoint: RequiredRequestEndpoint<Config> & { config: Config },
  options: Options,
  baseQuery: BaseQuery = {} as BaseQuery,
) {
  const config = endpoint.config
  const queryKey = queryKeyCreator(config, options, true)

  const processResponse = options.processResponse
  const res = (
    params: BaseQueryArgs<Config>,
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
      queryFn: async ({ signal, pageParam }) => {
        let result
        try {
          // @ts-expect-error TS2345 The type of request is correct
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

  return res
}
