import type {
  EndpointHandler,
  EndpointOptions,
  InferEndpointParams,
  Simplify,
} from '@navios/builder'
import type { DataTag, InfiniteData, UseSuspenseInfiniteQueryOptions } from '@tanstack/react-query'
import type { z, ZodObject, ZodType } from 'zod/v4'

import type { Split } from '../../common/types.mjs'
import type { InfiniteUnwrapMode, QueryHelpers } from '../../query/types.mjs'

import type { ComputeResult } from './helpers.mjs'

/**
 * Query schema constraint: infinite queries require `querySchema` to derive
 * the page-param type. Extracts the `ZodObject` from `Options['querySchema']`
 * with a fallback when the constraint is somehow not met.
 */
type InfiniteQuerySchema<Options extends EndpointOptions> = Options['querySchema'] extends ZodObject
  ? Options['querySchema']
  : ZodObject

/**
 * Surface-specific fields layered on top of `EndpointOptions` for the inline
 * config path. Stripped before forwarding to `api.declareEndpoint`.
 *
 * `getNextPageParam` is required: infinite queries cannot paginate without it.
 */
interface InfiniteQuerySurfaceFields<
  Options extends EndpointOptions,
  Unwrap extends InfiniteUnwrapMode,
> {
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
  keyPrefix?: string[]
  keySuffix?: string[]
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
  initialPageParam?: z.input<InfiniteQuerySchema<Options>>
}

/**
 * Return type for the infinite-query callable + attached helpers.
 */
type InfiniteQueryReturn<
  Options extends EndpointOptions & { querySchema: ZodObject },
  Unwrap extends InfiniteUnwrapMode,
> = ((
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
  > & { endpoint: EndpointHandler<Options> }

/**
 * Infinite-query surface using interface overloads to express the two call
 * shapes:
 *
 * - inline config with `getNextPageParam` baked in, OR
 * - existing `EndpointHandler` plus a required `options` carrying
 *   `getNextPageParam`.
 *
 * `Options` is inferred from the literal config via the structural copy
 * `{ [K in keyof Options]: Options[K] }`, which keeps surface-specific fields
 * out of `Options`. Downstream return-type derivations reference `Options`
 * directly so adding a new endpoint field to `EndpointOptions` propagates
 * automatically.
 *
 * For projecting `InfiniteData<PageResult>` into a derived shape, callers
 * should use TanStack Query's built-in `select` option on `use()` /
 * `useSuspense()`.
 */
export interface ClientInfiniteQueryMethods {
  /**
   * Creates a type-safe infinite query from an inline config.
   *
   * @example
   * ```ts
   * const getUsers = client.infiniteQuery({
   *   method: 'GET',
   *   url: '/users',
   *   querySchema: z.object({ page: z.number() }),
   *   responseSchema: z.array(userSchema),
   *   getNextPageParam: (lastPage, allPages, lastPageParam) =>
   *     lastPage.length > 0 ? { page: (lastPageParam?.page ?? 0) + 1 } : undefined,
   * })
   * ```
   */
  infiniteQuery<
    const Options extends EndpointOptions & { querySchema: ZodObject },
    const Unwrap extends InfiniteUnwrapMode = 'none',
  >(
    config: { [K in keyof Options]: Options[K] } & InfiniteQuerySurfaceFields<Options, Unwrap>,
  ): InfiniteQueryReturn<Options, Unwrap>

  /**
   * Creates a type-safe infinite query from an existing endpoint handler.
   *
   * @example
   * ```ts
   * const endpoint = api.declareEndpoint({
   *   method: 'GET',
   *   url: '/users',
   *   querySchema: z.object({ page: z.number() }),
   *   responseSchema: z.array(userSchema),
   * })
   * const getUsers = client.infiniteQuery(endpoint, {
   *   getNextPageParam: (lastPage, allPages, lastPageParam) =>
   *     lastPage.length > 0 ? { page: (lastPageParam?.page ?? 0) + 1 } : undefined,
   * })
   * ```
   */
  infiniteQuery<
    const Options extends EndpointOptions & { querySchema: ZodObject },
    const Unwrap extends InfiniteUnwrapMode = 'none',
  >(
    endpoint: EndpointHandler<Options>,
    options: InfiniteQuerySurfaceFields<Options, Unwrap>,
  ): InfiniteQueryReturn<Options, Unwrap>
}
