import type {
  EndpointOptions,
  ErrorSchemaRecord,
  HttpMethod,
  InferEndpointParams,
  Simplify,
} from '@navios/builder'
import type { DataTag, UseSuspenseQueryOptions } from '@tanstack/react-query'
import type { ZodObject, ZodType } from 'zod/v4'

import type { Split } from '../../common/types.mjs'
import type { QueryHelpers, UnwrapMode } from '../../query/types.mjs'

import type { ComputeQueryResult, EndpointHelper, ResultMode } from './helpers.mjs'

/**
 * Helper type to build endpoint options without including undefined properties.
 * This ensures HasProperty correctly identifies missing properties.
 */
type BuildEndpointOptions<
  Method extends HttpMethod,
  Url extends string,
  QuerySchema extends ZodObject | undefined,
  RequestSchema extends ZodType | undefined,
  ResponseSchema extends ZodType,
  ErrorSchema extends ErrorSchemaRecord | undefined,
  UrlParamsSchema extends ZodObject | undefined,
> = {
  method: Method
  url: Url
  responseSchema: ResponseSchema
} & (QuerySchema extends undefined ? {} : { querySchema: QuerySchema }) &
  (RequestSchema extends undefined ? {} : { requestSchema: RequestSchema }) &
  (ErrorSchema extends undefined ? {} : { errorSchema: ErrorSchema }) &
  (UrlParamsSchema extends undefined ? {} : { urlParamsSchema: UrlParamsSchema })

/**
 * Extended endpoint options interface for query that includes processResponse.
 */
interface QueryEndpointConfig<
  Method extends HttpMethod,
  Url extends string,
  QuerySchema extends ZodObject | undefined,
  RequestSchema extends ZodType | undefined,
  ResponseSchema extends ZodType,
  ErrorSchema extends ErrorSchemaRecord | undefined,
  UrlParamsSchema extends ZodObject | undefined,
  ResultModeT extends ResultMode,
  Unwrap extends UnwrapMode | undefined,
  TBaseResult,
  Result,
> extends EndpointOptions {
  method: Method
  url: Url
  querySchema?: QuerySchema
  requestSchema?: RequestSchema
  responseSchema: ResponseSchema
  errorSchema?: ErrorSchema
  urlParamsSchema?: UrlParamsSchema
  processResponse?: (data: TBaseResult) => Result
  /**
   * Selects the wire-level result shape produced by the endpoint.
   *
   * - `'data'` (or omitted, default): legacy throwing surface — success body
   *   is returned, errors throw.
   * - `'envelope'`: surface becomes a `ResponseEnvelope<Data, EnvelopeError<...>>`.
   *   Combine with {@link unwrap} to control how the envelope is exposed to
   *   React Query.
   */
  result?: ResultModeT
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
}

/**
 * Query method using decomposed generics pattern for proper processResponse typing.
 */
export interface ClientQueryMethods {
  /**
   * Creates a type-safe query with automatic type inference.
   *
   * Uses decomposed generic pattern to infer types from the configuration object.
   * All schema combinations are handled by a single method.
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
  query<
    const Method extends HttpMethod = HttpMethod,
    const Url extends string = string,
    const QuerySchema extends ZodObject | undefined = undefined,
    const RequestSchema extends ZodType | undefined = undefined,
    const ResponseSchema extends ZodType = ZodType,
    const ErrorSchema extends ErrorSchemaRecord | undefined = undefined,
    const UrlParamsSchema extends ZodObject | undefined = undefined,
    const ResultModeT extends ResultMode = undefined,
    const Unwrap extends UnwrapMode | undefined = undefined,
    const TBaseResult = ComputeQueryResult<ResponseSchema, ErrorSchema, ResultModeT, Unwrap>,
    const Result = TBaseResult,
    const Options extends EndpointOptions = BuildEndpointOptions<
      Method,
      Url,
      QuerySchema,
      RequestSchema,
      ResponseSchema,
      ErrorSchema,
      UrlParamsSchema
    >,
  >(
    config: QueryEndpointConfig<
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
      Result
    >,
  ): ((
    params: Simplify<InferEndpointParams<Options>>,
  ) => UseSuspenseQueryOptions<Result, Error, Result, DataTag<Split<Url, '/'>, Result, Error>>) &
    QueryHelpers<Url, QuerySchema, Result, false, RequestSchema> &
    EndpointHelper<Options>
}
