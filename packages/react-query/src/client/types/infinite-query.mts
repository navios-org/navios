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
 * Extended endpoint options interface for infinite query that includes processResponse and pagination.
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
  Unwrap extends InfiniteUnwrapMode | undefined,
  TBaseResult,
  PageResult,
> extends EndpointOptions {
  method: Method
  url: Url
  querySchema: QuerySchema
  requestSchema?: RequestSchema
  responseSchema: ResponseSchema
  errorSchema?: ErrorSchema
  urlParamsSchema?: UrlParamsSchema
  processResponse?: (data: TBaseResult) => PageResult
  /**
   * Selects the wire-level result shape produced by the endpoint.
   *
   * - `'data'` (or omitted, default): legacy throwing surface — success body
   *   is returned, errors throw.
   * - `'envelope'`: each page becomes a `ResponseEnvelope`. Combine with
   *   {@link unwrap} to control how pages are exposed to React Query.
   */
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
 * Infinite query method using decomposed generics pattern for proper processResponse typing.
 */
export interface ClientInfiniteQueryMethods {
  /**
   * Creates a type-safe infinite query with automatic type inference.
   *
   * Uses decomposed generic pattern to infer types from the configuration object.
   * All schema combinations are handled by a single method.
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
    const Unwrap extends InfiniteUnwrapMode | undefined = undefined,
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
    const TBaseResult = ComputeResult<Options, Unwrap extends undefined ? 'none' : Unwrap>,
    const PageResult = TBaseResult,
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
      TBaseResult,
      PageResult
    >,
  ): ((
    params: Simplify<InferEndpointParams<Options>>,
  ) => UseSuspenseInfiniteQueryOptions<
    PageResult,
    Error,
    InfiniteData<PageResult>,
    DataTag<Split<Url, '/'>, PageResult, Error>,
    z.output<QuerySchema>
  >) &
    QueryHelpers<Url, QuerySchema, PageResult, true, RequestSchema> &
    EndpointHelper<Options>
}
