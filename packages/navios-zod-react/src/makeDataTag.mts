import type {
  EndpointConfig,
  RequiredRequestEndpoint,
} from '@navios/navios-zod'
import type { DataTag } from '@tanstack/react-query'
import type { z } from 'zod'

import { queryOptions } from '@tanstack/react-query'

import type { BaseQueryArgs, BaseQueryParams } from './types.mjs'

/**
 * This helper function is useful to create a data tag for a query.
 *
 * It can be used with `setQueryData` to work with this API in a secure way.
 * @param endpoint
 * @param options
 */
export function makeDataTag<
  Config extends EndpointConfig,
  Options extends BaseQueryParams<Config>,
>(
  endpoint: RequiredRequestEndpoint<Config> & { config: Config },
  options: Options,
) {
  const config = endpoint.config
  // Let's hack the url to be a string for now
  const url = config.url
  const urlParts = url.split('/')

  return (
    params: BaseQueryArgs<Config>,
  ): Options['processResponse'] extends (...args: any[]) => infer Result
    ? DataTag<[Config['url']], Result, Error>
    : DataTag<[Config['url']], z.output<Config['responseSchema']>> => {
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
    }).queryKey
  }
}
