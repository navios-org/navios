import type { EndpointOptions, InferEndpointParams, Simplify } from '@navios/builder'
import type { DataTag, InfiniteData, UseSuspenseInfiniteQueryOptions } from '@tanstack/react-query'
import type { z, ZodObject, ZodType } from 'zod/v4'

import type { Split } from '../../common/types.mjs'
import type { InfiniteUnwrapMode, QueryHelpers } from '../../query/types.mjs'

import type { ComputeResult, EndpointHelper } from './helpers.mjs'

/**
 * Query schema constraint: infinite queries require `querySchema` to derive
 * the page-param type. Extracts the `ZodObject` from `Options['querySchema']`
 * with a fallback when the constraint is somehow not met.
 */
type InfiniteQuerySchema<Options extends EndpointOptions> = Options['querySchema'] extends ZodObject
  ? Options['querySchema']
  : ZodObject

/**
 * Infinite query method using a single `Options extends EndpointOptions & {
 * querySchema: ZodObject }` generic (inferred from the literal config via
 * the structural copy `{ [K in keyof Options]: Options[K] }`, which keeps
 * surface-specific fields like `unwrap` / `getNextPageParam` out of
 * `Options`) plus an `Unwrap` mode and a derived `PageResult`. Downstream
 * return-type derivations reference `Options` directly so adding a new
 * endpoint field to `EndpointOptions` propagates automatically.
 *
 * For projecting `InfiniteData<PageResult>` into a derived shape, callers
 * should use TanStack Query's built-in `select` option on `use()` /
 * `useSuspense()`.
 */
export interface ClientInfiniteQueryMethods {
  /**
   * Creates a type-safe infinite query with automatic type inference.
   *
   * @example
   * ```ts
   * const getUsers = client.infiniteQuery({
   *   method: 'GET',
   *   url: '/users',
   *   querySchema: z.object({ page: z.number() }),
   *   responseSchema: z.array(userSchema),
   *   getNextPageParam: (lastPage, allPages, lastPageParam) => {
   *     return lastPage.length > 0 ? { page: (lastPageParam?.page ?? 0) + 1 } : undefined
   *   },
   * })
   *
   * const { data } = getUsers.useSuspense({ params: { page: 0 } })
   * ```
   */
  infiniteQuery<
    const Options extends EndpointOptions & { querySchema: ZodObject },
    const Unwrap extends InfiniteUnwrapMode = 'none',
  >(
    config: { [K in keyof Options]: Options[K] } & {
      /**
       * For endpoints declared with `result: 'envelope'`, controls how each page
       * is delivered to React Query.
       *
       * - `'none'` (default): each page is the full `ResponseEnvelope`.
       * - `'throw-on-error'`: on `envelope.ok === false`, the `envelope.error`
       *   is thrown so React Query's `error` channel fires.
       * - `'pages'`: recommended for infinite queries; currently identical to
       *   `'throw-on-error'` at runtime — success pages are unwrapped to
       *   `envelope.data` and errors throw.
       *
       * Has no effect for non-envelope endpoints.
       */
      unwrap?: Unwrap
      getNextPageParam: (
        lastPage: ComputeResult<Options, Unwrap>,
        allPages: ComputeResult<Options, Unwrap>[],
        lastPageParam: z.infer<InfiniteQuerySchema<Options>> | undefined,
        allPageParams: z.infer<InfiniteQuerySchema<Options>>[] | undefined,
      ) => z.input<InfiniteQuerySchema<Options>> | undefined
      getPreviousPageParam?: (
        firstPage: ComputeResult<Options, Unwrap>,
        allPages: ComputeResult<Options, Unwrap>[],
        lastPageParam: z.infer<InfiniteQuerySchema<Options>> | undefined,
        allPageParams: z.infer<InfiniteQuerySchema<Options>>[] | undefined,
      ) => z.input<InfiniteQuerySchema<Options>>
    },
  ): ((
    params: Simplify<InferEndpointParams<Options>>,
  ) => UseSuspenseInfiniteQueryOptions<
    ComputeResult<Options, Unwrap>,
    Error,
    InfiniteData<ComputeResult<Options, Unwrap>>,
    DataTag<Split<Options['url'], '/'>, ComputeResult<Options, Unwrap>, Error>,
    z.output<InfiniteQuerySchema<Options>>
  >) &
    QueryHelpers<
      Options['url'],
      Options['querySchema'] extends ZodObject ? Options['querySchema'] : undefined,
      ComputeResult<Options, Unwrap>,
      true,
      Options['requestSchema'] extends ZodType ? Options['requestSchema'] : undefined
    > &
    EndpointHelper<Options>
}
