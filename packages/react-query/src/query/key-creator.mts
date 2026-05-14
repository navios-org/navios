import { bindUrlParams } from '@navios/builder'

import type { EndpointOptions, UrlHasParams } from '@navios/builder'
import type { DataTag, InfiniteData } from '@tanstack/react-query'
import type { z } from 'zod/v4'

import type { Split } from '../common/types.mjs'

import type { QueryKeyCreatorResult, QueryParams } from './types.mjs'

/**
 * Creates a query key generator for a given endpoint configuration.
 *
 * The returned object provides methods to generate query keys that can be used
 * with TanStack Query for caching, invalidation, and data tagging.
 *
 * @param config - The endpoint configuration
 * @param options - Query parameters including key prefix/suffix
 * @param isInfinite - Whether this is for an infinite query
 * @returns An object with methods to generate query keys
 */
export function createQueryKey<
  Config extends EndpointOptions,
  Options extends QueryParams<Config>,
  IsInfinite extends boolean,
  Url extends Config['url'] = Config['url'],
  HasParams extends UrlHasParams<Url> = UrlHasParams<Url>,
>(
  config: Config,
  options: Options,
  _isInfinite: IsInfinite,
): QueryKeyCreatorResult<
  Config['querySchema'],
  Url,
  z.output<Config['responseSchema']>,
  IsInfinite,
  HasParams
> {
  const url = config.url as Url
  const urlParts = url.split('/').filter(Boolean) as Split<Url, '/'>
  return {
    template: urlParts,
    dataTag: (params) => {
      const queryParams =
        params && 'querySchema' in config && 'params' in params
          ? config.querySchema?.parse(params.params)
          : []

      // Use bindUrlParams to get the bound URL, then split it to get the parts
      const boundUrl = bindUrlParams<Url>(
        url,
        params && 'urlParams' in params ? params : {},
        config.urlParamsSchema,
      )
      const boundUrlParts = boundUrl.split('/').filter(Boolean)

      return [
        ...(options.keyPrefix ?? []),
        ...boundUrlParts,
        ...(options.keySuffix ?? []),
        queryParams ?? [],
      ] as unknown as DataTag<
        Split<Url, '/'>,
        IsInfinite extends true
          ? InfiniteData<z.output<Config['responseSchema']>>
          : z.output<Config['responseSchema']>,
        Error
      >
    },
    filterKey: (params) => {
      // Use bindUrlParams to get the bound URL, then split it to get the parts
      const boundUrl = bindUrlParams<Url>(
        url,
        params && 'urlParams' in params ? params : {},
        config.urlParamsSchema,
      )
      const boundUrlParts = boundUrl.split('/').filter(Boolean)

      return [
        ...(options.keyPrefix ?? []),
        ...boundUrlParts,
        ...(options.keySuffix ?? []),
      ] as unknown as DataTag<
        Split<Url, '/'>,
        IsInfinite extends true
          ? InfiniteData<z.output<Config['responseSchema']>>
          : z.output<Config['responseSchema']>,
        Error
      >
    },

    bindToUrl: (params) => {
      return bindUrlParams<Url>(
        url,
        params && 'urlParams' in params ? params : {},
        config.urlParamsSchema,
      )
    },
  }
}

// Legacy export for backwards compatibility
/** @deprecated Use createQueryKey instead */
export const queryKeyCreator = createQueryKey
