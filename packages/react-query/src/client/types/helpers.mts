import type {
  BaseEndpointOptions,
  EndpointHandler,
  EndpointOptions,
  EnvelopeError,
  ErrorSchemaRecord,
  HttpMethod,
  ResponseEnvelope,
  StreamHandler,
} from '@navios/builder'
import type { z, ZodType } from 'zod/v4'

import type { InfiniteUnwrapMode, UnwrapMode } from '../../query/types.mjs'

/**
 * Result mode parameter for inline client configs.
 *
 * - `'data'` (or `undefined`, default): legacy "data-only" surface — success
 *   `z.output<ResponseSchema>` is returned, errors are thrown.
 * - `'envelope'`: surface type is `ResponseEnvelope<Data, EnvelopeError<ErrorSchema>>`.
 */
export type ResultMode = 'data' | 'envelope' | undefined

/**
 * Compute the base result type based on result mode.
 *
 * - `Result extends 'envelope'`: surfaces a `ResponseEnvelope`. The envelope's
 *   error branch is typed by `EnvelopeError<ErrorSchema>`.
 * - Otherwise (data-mode default): success type is returned and errors are thrown.
 */
export type ComputeBaseResult<
  ResponseSchema extends ZodType,
  ErrorSchema extends ErrorSchemaRecord | undefined = undefined,
  Result extends ResultMode = undefined,
> = Result extends 'envelope'
  ? ResponseEnvelope<
      z.output<ResponseSchema>,
      EnvelopeError<ErrorSchema extends ErrorSchemaRecord ? ErrorSchema : undefined>
    >
  : z.output<ResponseSchema>

/**
 * Compute the data-channel result type given a `Result` mode and `Unwrap` mode.
 *
 * Behaviour matrix:
 * | Result      | Unwrap            | Surface type                                 |
 * | ----------- | ----------------- | -------------------------------------------- |
 * | 'envelope'  | 'none' (default)  | `ResponseEnvelope<...>`                      |
 * | 'envelope'  | 'throw-on-error'  | `z.output<ResponseSchema>` (unwrapped body)  |
 * | 'data'/und. | any               | `z.output<ResponseSchema>`                   |
 *
 * Mirrors {@link EnvelopeQueryResult} but takes the raw inline-config generics
 * rather than a derived `EndpointOptions`.
 */
export type ComputeQueryResult<
  ResponseSchema extends ZodType,
  ErrorSchema extends ErrorSchemaRecord | undefined = undefined,
  Result extends ResultMode = undefined,
  Unwrap extends UnwrapMode | undefined = undefined,
> = Result extends 'envelope'
  ? Unwrap extends 'throw-on-error'
    ? z.output<ResponseSchema>
    : ResponseEnvelope<
        z.output<ResponseSchema>,
        EnvelopeError<ErrorSchema extends ErrorSchemaRecord ? ErrorSchema : undefined>
      >
  : ComputeBaseResult<ResponseSchema, ErrorSchema>

/**
 * Like {@link ComputeQueryResult} but for infinite queries where `'pages'`
 * also unwraps each page to its envelope body.
 */
export type ComputeInfinitePageResult<
  ResponseSchema extends ZodType,
  ErrorSchema extends ErrorSchemaRecord | undefined = undefined,
  Result extends ResultMode = undefined,
  Unwrap extends InfiniteUnwrapMode | undefined = undefined,
> = Result extends 'envelope'
  ? Unwrap extends 'throw-on-error' | 'pages'
    ? z.output<ResponseSchema>
    : ResponseEnvelope<
        z.output<ResponseSchema>,
        EnvelopeError<ErrorSchema extends ErrorSchemaRecord ? ErrorSchema : undefined>
      >
  : ComputeBaseResult<ResponseSchema, ErrorSchema>

/**
 * Helper type to compute the response data type.
 *
 * @deprecated Use ComputeBaseResult instead (same logic, different parameter order)
 */
export type ResponseDataType<
  Response extends ZodType,
  ErrorSchema extends ErrorSchemaRecord | undefined,
> = ComputeBaseResult<Response, ErrorSchema>

/**
 * Helper type that attaches the endpoint to query/mutation results.
 * Supports both new const generic pattern and legacy pattern with individual parameters.
 *
 * New pattern (1 arg):
 * @template Options - EndpointOptions from builder (new const generic pattern)
 *
 * Legacy pattern (2-5 args):
 * @template Method - HTTP method
 * @template Url - URL template
 * @template RequestSchema - Request body schema
 * @template ResponseSchema - Response schema
 * @template QuerySchema - Query params schema (optional)
 */
export type EndpointHelper<
  OptionsOrMethod extends EndpointOptions | HttpMethod = EndpointOptions,
  Url extends string = string,
  RequestSchema = undefined,
  ResponseSchema extends ZodType = ZodType,
  QuerySchema = undefined,
> = OptionsOrMethod extends EndpointOptions
  ? {
      endpoint: EndpointHandler<OptionsOrMethod>
    }
  : OptionsOrMethod extends HttpMethod
    ? {
        endpoint: EndpointHandler<
          EndpointOptions & {
            method: OptionsOrMethod
            url: Url
            requestSchema: RequestSchema
            responseSchema: ResponseSchema
            querySchema: QuerySchema
          }
        >
      }
    : never

// Legacy export for backwards compatibility
/** @deprecated Use EndpointHelper instead */
export type ClientEndpointHelper<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  RequestSchema = unknown,
  ResponseSchema extends z.ZodType = z.ZodType,
  QuerySchema = unknown,
> = EndpointHelper<Method, Url, RequestSchema, ResponseSchema, QuerySchema>

/**
 * Helper type that attaches a stream endpoint to mutation results.
 * Supports both new const generic pattern and legacy pattern with individual parameters.
 *
 * New pattern (1 arg):
 * @template Options - BaseEndpointOptions from builder (new const generic pattern)
 *
 * Legacy pattern (2-6 args):
 * @template Method - HTTP method
 * @template Url - URL template
 * @template QuerySchema - Query params schema
 * @template RequestSchema - Request body schema
 * @template ErrorSchema - Error schema (optional)
 * @template UrlParamsSchema - URL params schema (optional)
 */
export type StreamHelper<
  OptionsOrMethod extends BaseEndpointOptions | HttpMethod = BaseEndpointOptions,
  Url extends string = string,
  QuerySchema = undefined,
  RequestSchema = undefined,
  ErrorSchema = undefined,
  UrlParamsSchema = undefined,
> = OptionsOrMethod extends BaseEndpointOptions
  ? {
      endpoint: StreamHandler<OptionsOrMethod>
    }
  : OptionsOrMethod extends HttpMethod
    ? {
        endpoint: StreamHandler<
          BaseEndpointOptions & {
            method: OptionsOrMethod
            url: Url
            querySchema: QuerySchema
            requestSchema: RequestSchema
            errorSchema: ErrorSchema
            urlParamsSchema: UrlParamsSchema
          }
        >
      }
    : never
