import type { AnyEndpointConfig, UrlHasParams } from '@navios/builder'
import type { DataTag, InfiniteData } from '@tanstack/react-query'

import { bindUrlParams } from '@navios/builder'

import type { Split } from '../common/types.mjs'
import type { QueryKeyCreatorResult, QueryParams } from './types.mjs'

/**
 * Creates a query key generator for a given endpoint configuration.
 *
 * The returned object provides methods to generate query keys that can be used
 * with TanStack Query for caching, invalidation, and data tagging.
 *
 * @param config - The endpoint configuration
 * @param options - Query parameters including processResponse and key prefix/suffix
 * @param isInfinite - Whether this is for an infinite query
 * @returns An object with methods to generate query keys
 */
export function createQueryKey<
  Config extends AnyEndpointConfig,
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
  Options['processResponse'] extends (...args: any[]) => infer Result
    ? Result
    : never,
  IsInfinite,
  HasParams
> {
  const url = config.url as Url
  const urlParts = url.split('/').filter(Boolean) as Split<Url, '/'>
  return {
    template: urlParts,
    // @ts-expect-error We have correct types in return type
    dataTag: (params) => {
      const queryParams =
        params && 'querySchema' in config && 'params' in params
          ? config.querySchema?.parse(params.params)
          : []
      return [
        ...(options.keyPrefix ?? []),
        ...urlParts.map((part) =>
          part.startsWith('$')
            ? // @ts-expect-error TS2339 We know that the urlParams are defined only if the url has params
              params.urlParams[part.slice(1)].toString()
            : part,
        ),
        ...(options.keySuffix ?? []),
        queryParams ?? [],
      ] as unknown as DataTag<
        Split<Url, '/'>,
        Options['processResponse'] extends (...args: any[]) => infer Result
          ? IsInfinite extends true
            ? InfiniteData<Result>
            : Result
          : never,
        Error
      >
    },
    // @ts-expect-error We have correct types in return type
    filterKey: (params) => {
      return [
        ...(options.keyPrefix ?? []),
        ...urlParts.map((part) =>
          part.startsWith('$')
            ? // @ts-expect-error TS2339 We know that the urlParams are defined only if the url has params
              params.urlParams[part.slice(1)].toString()
            : part,
        ),
        ...(options.keySuffix ?? []),
      ] as unknown as DataTag<
        Split<Url, '/'>,
        Options['processResponse'] extends (...args: any[]) => infer Result
          ? IsInfinite extends true
            ? InfiniteData<Result>
            : Result
          : never,
        Error
      >
    },

    bindToUrl: (params) => {
      return bindUrlParams<Url>(url, params ?? ({} as never))
    },
  }
}

// Legacy export for backwards compatibility
/** @deprecated Use createQueryKey instead */
export const queryKeyCreator = createQueryKey
