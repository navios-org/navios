import type { EndpointOptions, InferEndpointParams, Simplify } from '@navios/builder'
import type { DataTag, UseSuspenseQueryOptions } from '@tanstack/react-query'
import type { ZodObject, ZodType } from 'zod/v4'

import type { Split } from '../../common/types.mjs'
import type { QueryHelpers, UnwrapMode } from '../../query/types.mjs'

import type { ComputeResult, EndpointHelper } from './helpers.mjs'

/**
 * Query method using a single `Options extends EndpointOptions` generic plus
 * an `Unwrap` mode generic. `Options` is inferred from the literal config via
 * the structural copy `{ [K in keyof Options]: Options[K] }`, which keeps the
 * surface-specific fields (`unwrap`, `keyPrefix`, `keySuffix`) out of
 * `Options`. Downstream return-type derivations reference `Options` directly
 * so adding a new endpoint field to `EndpointOptions` propagates
 * automatically.
 *
 * For projecting the cached data into a derived shape, callers should use
 * TanStack Query's built-in `select` option on `use()` / `useSuspense()`.
 */
export interface ClientQueryMethods {
  /**
   * Creates a type-safe query with automatic type inference.
   *
   * @example
   * ```ts
   * const getUser = client.query({
   *   method: 'GET',
   *   url: '/users/$userId',
   *   responseSchema: userSchema,
   *   urlParamsSchema: z.object({ userId: z.string().uuid() }),
   * })
   *
   * const { data } = getUser.useSuspense({ urlParams: { userId: '123' } })
   * ```
   */
  query<const Options extends EndpointOptions, const Unwrap extends UnwrapMode = 'none'>(
    config: { [K in keyof Options]: Options[K] } & {
      /**
       * For endpoints declared with `result: 'envelope'`, controls how the
       * envelope is delivered to React Query.
       *
       * - `'none'` (default): the `ResponseEnvelope` is cached as-is.
       * - `'throw-on-error'`: on `envelope.ok === false`, the `envelope.error`
       *   is thrown so React Query's `error` channel fires.
       *
       * Has no effect for non-envelope endpoints.
       */
      unwrap?: Unwrap
      keyPrefix?: string[]
      keySuffix?: string[]
    },
  ): ((
    params: Simplify<InferEndpointParams<Options>>,
  ) => UseSuspenseQueryOptions<
    ComputeResult<Options, Unwrap>,
    Error,
    ComputeResult<Options, Unwrap>,
    DataTag<Split<Options['url'], '/'>, ComputeResult<Options, Unwrap>, Error>
  >) &
    QueryHelpers<
      Options['url'],
      Options['querySchema'] extends ZodObject ? Options['querySchema'] : undefined,
      ComputeResult<Options, Unwrap>,
      false,
      Options['requestSchema'] extends ZodType ? Options['requestSchema'] : undefined
    > &
    EndpointHelper<Options>
}
