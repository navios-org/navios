import type {
  EndpointOptions,
  ErrorSchemaRecord,
  HttpMethod,
  InferEndpointParams,
  Simplify,
} from '@navios/builder'
import type {
  DataTag,
  InfiniteData,
  UseSuspenseInfiniteQueryOptions,
} from '@tanstack/react-query'
import type { z, ZodObject, ZodType } from 'zod/v4'

import type { Split } from '../../common/types.mjs'
import type { QueryHelpers } from '../../query/types.mjs'
import type { ComputeBaseResult, EndpointHelper } from './helpers.mjs'

/**
 * Extended endpoint options interface for infinite query that includes processResponse and pagination.
 */
interface InfiniteQueryEndpointConfig<
  _UseDiscriminator extends boolean,
  Method extends HttpMethod,
  Url extends string,
  QuerySchema extends ZodObject,
  RequestSchema extends ZodType | undefined,
  ResponseSchema extends ZodType,
  ErrorSchema extends ErrorSchemaRecord | undefined,
  UrlParamsSchema extends ZodObject | undefined,
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
 *
 * @template UseDiscriminator - When `true`, errors are returned as union types.
 *   When `false` (default), errors are thrown and not included in TData.
 */
export interface ClientInfiniteQueryMethods<
  UseDiscriminator extends boolean = false,
> {
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
    const TBaseResult = ComputeBaseResult<
      UseDiscriminator,
      ResponseSchema,
      ErrorSchema
    >,
    const PageResult = TBaseResult,
    const Options extends EndpointOptions = {
      method: Method
      url: Url
      querySchema: QuerySchema
      requestSchema: RequestSchema
      responseSchema: ResponseSchema
      errorSchema: ErrorSchema
      urlParamsSchema: UrlParamsSchema
    },
  >(
    config: InfiniteQueryEndpointConfig<
      UseDiscriminator,
      Method,
      Url,
      QuerySchema,
      RequestSchema,
      ResponseSchema,
      ErrorSchema,
      UrlParamsSchema,
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
    EndpointHelper<Options, UseDiscriminator>
}
