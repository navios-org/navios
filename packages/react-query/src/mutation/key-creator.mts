import type { AnyEndpointConfig, UrlHasParams, UrlParams } from '@navios/builder'
import type { DataTag } from '@tanstack/react-query'

import { createQueryKey } from '../query/key-creator.mjs'

import type { QueryParams } from '../query/types.mjs'

/**
 * Creates a mutation key generator for a given endpoint configuration.
 *
 * @param config - The endpoint configuration
 * @param options - Optional query parameters with a default `processResponse` function
 * @returns A function that generates mutation keys
 *
 * @example Basic usage:
 * ```typescript
 * const createMutationKey = createMutationKey(endpoint.config);
 * const mutationKey = createMutationKey({ urlParams: { id: 123 } });
 * ```
 *
 * @example Advanced usage with processResponse:
 * ```ts
 * const createMutationKey = createMutationKey(endpoint.config, {
 *   processResponse: (data) => {
 *     if (!data.success) {
 *       throw new Error(data.message);
 *     }
 *     return data.data;
 *   },
 * });
 * // We create a mutation that will be shared across the project for all passed userId
 * const mutationKey = createMutationKey({ urlParams: { projectId: 123, userId: 'wildcard' } });
 * ```
 */
export function createMutationKey<
  Config extends AnyEndpointConfig,
  Options extends QueryParams<Config>,
  Url extends Config['url'] = Config['url'],
  HasParams extends UrlHasParams<Url> = UrlHasParams<Url>,
>(
  config: Config,
  options: Options = {
    processResponse: (data) => data,
  } as Options,
): (
  params: HasParams extends true ? { urlParams: UrlParams<Url> } : {},
) => Options['processResponse'] extends (...args: unknown[]) => infer Result
  ? DataTag<[Config['url']], Result, Error>
  : never {
  const queryKey = createQueryKey(config, options, false)

  // @ts-expect-error We have correct types in return type
  return (params) => {
    return queryKey.filterKey(params)
  }
}

// Legacy export for backwards compatibility
/** @deprecated Use createMutationKey instead */
export const mutationKeyCreator = createMutationKey
