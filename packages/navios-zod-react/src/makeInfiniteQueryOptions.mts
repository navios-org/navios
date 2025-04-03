import type {
  EndpointConfig,
  RequiredRequestEndpoint,
  UrlParams,
} from '@navios/navios-zod'
import type {
  InfiniteData,
  UseInfiniteQueryOptions,
} from '@tanstack/react-query'
import type { z } from 'zod'

import { infiniteQueryOptions } from '@tanstack/react-query'

import type { BaseQueryArgs, InfiniteQueryOptions } from './types.mjs'

export function makeInfiniteQueryOptions<
  Config extends Required<EndpointConfig>,
  Options extends InfiniteQueryOptions<Config>,
  BaseQuery extends Omit<
    UseInfiniteQueryOptions<ReturnType<Options['processResponse']>, Error, any>,
    'queryKey' | 'queryFn' | 'getNextPageParam' | 'initialPageParam'
  >,
>(
  endpoint: RequiredRequestEndpoint<Config> & { config: Config },
  options: Options,
  baseQuery: BaseQuery = {} as BaseQuery,
) {
  const config = endpoint.config
  // Let's hack the url to be a string for now
  const url = config.url
  const urlParts = url.split('/')

  const processResponse = options.processResponse
  return (
    params: BaseQueryArgs<Config>,
  ): Options['processResponse'] extends (...args: any[]) => infer Result
    ? UseInfiniteQueryOptions<
        Result,
        Error,
        BaseQuery['select'] extends (...args: any[]) => infer T
          ? T
          : InfiniteData<Result>
      >
    : never => {
    const queryParams =
      'querySchema' in config && 'params' in params
        ? config.querySchema?.parse(params.params)
        : []

    // @ts-expect-error TS2322 We know that the processResponse is defined
    return infiniteQueryOptions({
      queryKey: [
        ...(options.keyPrefix ?? []),
        ...urlParts.map((part) =>
          part.startsWith('$')
            ? // @ts-expect-error TS2339 We know that the urlParams are defined only if the url has params
              params.urlParams[part.slice(1)].toString()
            : part,
        ),
        ...(options.keySuffix ?? []),
        queryParams ?? [],
      ],
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
}
