import type {
  EndpointHandler,
  EndpointOptions,
  InferEndpointParams,
  Simplify,
} from '@navios/builder'
import type { DataTag, UseSuspenseQueryOptions } from '@tanstack/react-query'
import type { ZodObject, ZodType } from 'zod/v4'

import type { Split } from '../../common/types.mjs'
import type { QueryHelpers, UnwrapMode } from '../../query/types.mjs'

import type { ComputeResult } from './helpers.mjs'

/**
 * Surface-specific fields layered on top of `EndpointOptions` for the inline
 * config path. These do not belong to `EndpointOptions` and are stripped out
 * at runtime before being forwarded to `api.declareEndpoint`.
 */
interface QuerySurfaceFields<Unwrap extends UnwrapMode> {
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
}

/**
 * Single overloaded query surface. The first argument is either:
 *
 * - an inline `EndpointOptions` config (with optional surface fields like
 *   `unwrap`, `keyPrefix`, `keySuffix`), or
 * - an existing `EndpointHandler` produced by `api.declareEndpoint`.
 *
 * In both cases the result is the same: a callable that produces
 * `UseSuspenseQueryOptions` plus the attached `QueryHelpers` + `endpoint`.
 *
 * `Options` is inferred from the literal config via the structural copy
 * `{ [K in keyof Options]: Options[K] }`, which keeps surface-specific fields
 * out of `Options`. Downstream return-type derivations reference `Options`
 * directly so adding a new endpoint field to `EndpointOptions` propagates
 * automatically.
 *
 * For projecting the cached data into a derived shape, callers should use
 * TanStack Query's built-in `select` option on `use()` / `useSuspense()`.
 */
export interface ClientQueryMethods {
  /**
   * Creates a type-safe query with automatic type inference, accepting either
   * an inline config or an existing endpoint handler.
   *
   * @example
   * ```ts
   * // Inline config
   * const getUser = client.query({
   *   method: 'GET',
   *   url: '/users/$userId',
   *   responseSchema: userSchema,
   *   urlParamsSchema: z.object({ userId: z.string().uuid() }),
   * })
   *
   * // From an existing endpoint
   * const getUserEndpoint = api.declareEndpoint({
   *   method: 'GET',
   *   url: '/users/$userId',
   *   responseSchema: userSchema,
   * })
   * const getUser2 = client.query(getUserEndpoint)
   * ```
   */
  query<const Options extends EndpointOptions, const Unwrap extends UnwrapMode = 'none'>(
    input:
      | ({ [K in keyof Options]: Options[K] } & QuerySurfaceFields<Unwrap>)
      | EndpointHandler<Options>,
    options?: QuerySurfaceFields<Unwrap>,
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
    > & { endpoint: EndpointHandler<Options> }
}
