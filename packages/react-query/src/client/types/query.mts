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

import type { ComputeResult, EndpointHelper, OptionsFromInline, ResultMode } from './helpers.mjs'

/**
 * Extended endpoint options interface for query.
 *
 * Inherits all endpoint fields from `EndpointOptions` and adds the
 * surface-specific `unwrap` field. The per-field generic parameters
 * (`Method`, `Url`, `QuerySchema`, …) re-declare the underlying endpoint
 * fields with concrete generics — this is what lets TypeScript infer the
 * precise shape of the literal passed to `query(...)`.
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
  Unwrap extends UnwrapMode,
> extends EndpointOptions {
  method: Method
  url: Url
  querySchema?: QuerySchema
  requestSchema?: RequestSchema
  responseSchema: ResponseSchema
  errorSchema?: ErrorSchema
  urlParamsSchema?: UrlParamsSchema
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
 * Query method using decomposed generics for inference. Once the literal is
 * inferred field-by-field, `Options` is synthesised via `OptionsFromInline`
 * and reused everywhere downstream — the return type only references
 * `Options` (and a handful of surface-specific generics), so adding a new
 * endpoint field to `EndpointOptions` propagates via `Options` automatically.
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
  query<
    const Method extends HttpMethod = HttpMethod,
    const Url extends string = string,
    const QuerySchema extends ZodObject | undefined = undefined,
    const RequestSchema extends ZodType | undefined = undefined,
    const ResponseSchema extends ZodType = ZodType,
    const ErrorSchema extends ErrorSchemaRecord | undefined = undefined,
    const UrlParamsSchema extends ZodObject | undefined = undefined,
    const ResultModeT extends ResultMode = undefined,
    const Unwrap extends UnwrapMode = 'none',
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
      Unwrap
    >,
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
