import type {
  AnyEndpointConfig,
  UrlHasParams,
  UrlParams,
} from '@navios/builder'
import type { DataTag } from '@tanstack/react-query'

import type { BaseQueryParams } from '../types.mjs'

import { queryKeyCreator } from './query-key-creator.mjs'

/**
 * Creates a mutation key for a given endpoint configuration and options.
 *
 * @param {config: Config } config - The endpoint object containing the configuration.
 * @param {Options} [options] - Optional query parameters with a default `processResponse` function that processes the response data.
 *
 * @returns {Object} An object containing the `mutationKey` function.
 *
 * The `mutationKey` function generates a mutation key based on the provided parameters:
 * - If the URL has parameters (`HasParams` is `true`), it expects an object with `urlParams`.
 * - The return type of the `mutationKey` function depends on the `processResponse` function in `options`.
 *   If `processResponse` is defined, the return type is a `DataTag` containing the processed result and an error type.
 *
 * @example Example usage:
 * ```typescript
 * const createMutationKey = mutationKeyCreator(endpoint.config);
 * const mutationKey = createMutationKey({ urlParams: { id: 123 } });
 * ```
 *
 * @example Advanced usage:
 * ```ts
 * const createMutationKey = mutationKeyCreator(endpoint.config, {
 *   processResponse: (data) => {
 *     if (!data.success) {
 *      throw new Error(data.message);
 *     }
 *     return data.data;
 *   },
 * });
 * // We create a mutation that will be shared across the project for all passed userId
 * const mutationKey = createMutationKey({ urlParams: { projectId: 123, userId: 'wildcard' } });
 */
export function mutationKeyCreator<
  Config extends AnyEndpointConfig,
  Options extends BaseQueryParams<Config>,
  Url extends Config['url'] = Config['url'],
  HasParams extends UrlHasParams<Url> = UrlHasParams<Url>,
>(
  config: Config,
  options: Options = {
    processResponse: (data) => data,
  } as Options,
): (
  params: HasParams extends true ? { urlParams: UrlParams<Url> } : {},
) => Options['processResponse'] extends (...args: any[]) => infer Result
  ? DataTag<[Config['url']], Result, Error>
  : never {
  const queryKey = queryKeyCreator(config, options, false)

  // @ts-expect-error We have correct types in return type
  return (params) => {
    return queryKey.filterKey(params)
  }
}
