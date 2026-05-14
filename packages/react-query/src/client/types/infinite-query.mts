import type {
  EndpointOptions,
  ErrorSchemaRecord,
  HttpMethod,
  InferEndpointParams,
  Simplify,
} from '@navios/builder'
import type { DataTag, InfiniteData, UseSuspenseInfiniteQueryOptions } from '@tanstack/react-query'
import type { z, ZodObject, ZodType } from 'zod/v4'

import type { Split } from '../../common/types.mjs'
import type { InfiniteUnwrapMode, QueryHelpers } from '../../query/types.mjs'

import type { ComputeResult, EndpointHelper, OptionsFromInline, ResultMode } from './helpers.mjs'

/**
 * Extended endpoint options interface for infinite query.
 *
 * Same decomposed-inference pattern as `query`; once `Options` is
 * synthesised the pagination callbacks (`getNextPageParam`,
 * `getPreviousPageParam`) read their page-param types from
 * `Options['querySchema']` directly.
 */
interface InfiniteQueryEndpointConfig<
  Method extends HttpMethod,
  Url extends string,
  QuerySchema extends ZodObject,
  RequestSchema extends ZodType | undefined,
  ResponseSchema extends ZodType,
  ErrorSchema extends ErrorSchemaRecord | undefined,
  UrlParamsSchema extends ZodObject | undefined,
  ResultModeT extends ResultMode,
  Unwrap extends InfiniteUnwrapMode,
  PageResult,
> extends EndpointOptions {
  method: Method
  url: Url
  querySchema: QuerySchema
  requestSchema?: RequestSchema
  responseSchema: ResponseSchema
  errorSchema?: ErrorSchema
  urlParamsSchema?: UrlParamsSchema
  result?: ResultModeT
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
    lastPage: PageResult,
    allPages: PageResult[],
    lastPageParam: z.infer<QuerySchema> | undefined,
    allPageParams: z.infer<QuerySchema>[] | undefined,
  ) => z.input<QuerySchema> | undefined
  getPreviousPageParam?: (
    firstPage: PageResult,
    allPages: PageResult[],
    lastPageParam: z.infer<QuerySchema> | undefined,
    allPageParams: z.infer<QuerySchema>[] | undefined,
  ) => z.input<QuerySchema>
}

/**
 * Infinite query method.
 *
 * Uses the same decomposed-inference / synthesised-Options pattern as
 * `query`. The constraint `Options extends EndpointOptions & { querySchema:
 * ZodObject }` is enforced through the required `querySchema` generic.
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
    const Method extends HttpMethod = HttpMethod,
    const Url extends string = string,
    const QuerySchema extends ZodObject = ZodObject,
    const RequestSchema extends ZodType | undefined = undefined,
    const ResponseSchema extends ZodType = ZodType,
    const ErrorSchema extends ErrorSchemaRecord | undefined = undefined,
    const UrlParamsSchema extends ZodObject | undefined = undefined,
    const ResultModeT extends ResultMode = undefined,
    const Unwrap extends InfiniteUnwrapMode = 'none',
    const Options extends EndpointOptions = OptionsFromInline<
      Method,
      Url,
      QuerySchema,
      RequestSchema,
      ResponseSchema,
      ErrorSchema,
      UrlParamsSchema,
      ResultModeT
    >,
    const PageResult = ComputeResult<Options, Unwrap>,
  >(
    config: InfiniteQueryEndpointConfig<
      Method,
      Url,
      QuerySchema,
      RequestSchema,
      ResponseSchema,
      ErrorSchema,
      UrlParamsSchema,
      ResultModeT,
      Unwrap,
      PageResult
    >,
  ): ((
    params: Simplify<InferEndpointParams<Options>>,
  ) => UseSuspenseInfiniteQueryOptions<
    PageResult,
    Error,
    InfiniteData<PageResult>,
    DataTag<Split<Options['url'], '/'>, PageResult, Error>,
    z.output<QuerySchema>
  >) &
    QueryHelpers<
      Options['url'],
      Options['querySchema'] extends ZodObject ? Options['querySchema'] : undefined,
      PageResult,
      true,
      Options['requestSchema'] extends ZodType ? Options['requestSchema'] : undefined
    > &
    EndpointHelper<Options>
}
