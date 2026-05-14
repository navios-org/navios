import type { EndpointOptions, UrlHasParams, UrlParams } from '@navios/builder'
import type { DataTag } from '@tanstack/react-query'
import type { z } from 'zod/v4'

import { createQueryKey } from '../query/key-creator.mjs'

import type { QueryParams } from '../query/types.mjs'

/**
 * Creates a mutation key generator for a given endpoint configuration.
 *
 * @param config - The endpoint configuration
 * @param options - Optional query parameters (key prefix/suffix)
 * @returns A function that generates mutation keys
 *
 * @example Basic usage:
 * ```typescript
 * const createMutationKey = createMutationKey(endpoint.config);
 * const mutationKey = createMutationKey({ urlParams: { id: 123 } });
 * ```
 */
export function createMutationKey<
  Config extends EndpointOptions,
  Options extends QueryParams<Config>,
  Url extends Config['url'] = Config['url'],
  HasParams extends UrlHasParams<Url> = UrlHasParams<Url>,
>(
  config: Config,
  options: Options = {} as Options,
): (
  params: HasParams extends true ? { urlParams: UrlParams<Url> } : {},
) => DataTag<[Config['url']], z.output<Config['responseSchema']>, Error> {
  const queryKey = createQueryKey(config, options, false)

  // @ts-expect-error We have correct types in return type
  return (params) => {
    return queryKey.filterKey(params)
  }
}

// Legacy export for backwards compatibility
/** @deprecated Use createMutationKey instead */
export const mutationKeyCreator = createMutationKey
