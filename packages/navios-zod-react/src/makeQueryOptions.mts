import type {
  EndpointConfig,
  RequiredRequestEndpoint,
} from '@navios/navios-zod'
import type { UseQueryOptions } from '@tanstack/react-query'

import { queryOptions } from '@tanstack/react-query'

import type { BaseQueryArgs, BaseQueryParams } from './types.mjs'

export function makeQueryOptions<
  Config extends EndpointConfig,
  Options extends BaseQueryParams<Config>,
  BaseQuery extends Omit<
    UseQueryOptions<ReturnType<Options['processResponse']>, Error, any>,
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
    ? UseQueryOptions<
        Result,
        Error,
        BaseQuery['select'] extends (...args: any[]) => infer T ? T : Result
      >
    : never => {
    const queryParams =
      'querySchema' in config && 'params' in params
        ? config.querySchema?.parse(params.params)
        : []

    // @ts-expect-error TS2322 We know that the processResponse is defined
    return queryOptions({
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
      queryFn: async ({ signal }) => {
        let result
        try {
          // @ts-expect-error TS2345 The type of request is correct
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
}
