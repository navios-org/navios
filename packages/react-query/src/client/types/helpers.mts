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
 * Compute the public data-channel type for an endpoint, taking unwrap mode
 * into account.
 *
 * Behaviour matrix:
 * | Endpoint    | Unwrap                       | Surface type                                  |
 * | ----------- | ---------------------------- | --------------------------------------------- |
 * | envelope    | `'none'` (default)           | `ResponseEnvelope<Data, EnvelopeError<...>>`  |
 * | envelope    | `'throw-on-error'`/`'pages'` | `z.output<responseSchema>` (unwrapped body)   |
 * | non-envelope| any                          | `z.output<responseSchema>`                    |
 *
 * Replaces the three previous helpers (`ComputeBaseResult`,
 * `ComputeQueryResult`, `ComputeInfinitePageResult`) — query/mutation use
 * `Unwrap extends UnwrapMode` ('none' | 'throw-on-error'), infinite queries
 * use `InfiniteUnwrapMode` which adds `'pages'`. Both fold into the same
 * branch here because `'pages'` and `'throw-on-error'` deliver the unwrapped
 * body.
 */
export type ComputeResult<
  Options extends EndpointOptions,
  Unwrap extends UnwrapMode | InfiniteUnwrapMode = 'none',
> = Options extends { result: 'envelope' }
  ? Unwrap extends 'throw-on-error' | 'pages'
    ? z.output<Options['responseSchema']>
    : ResponseEnvelope<
        z.output<Options['responseSchema']>,
        EnvelopeError<
          Options['errorSchema'] extends ErrorSchemaRecord ? Options['errorSchema'] : undefined
        >
      >
  : z.output<Options['responseSchema']>

/**
 * Build a minimal `EndpointOptions`-shaped type from the loose per-field
 * generics that the inline-config client methods (`client.query`,
 * `client.mutation`, `client.infiniteQuery`, `client.multipartMutation`)
 * carry.
 *
 * Optional fields (`querySchema`, `requestSchema`, `errorSchema`,
 * `urlParamsSchema`) are only present in the resulting shape when the
 * corresponding generic is not `undefined` — this keeps property-presence
 * checks (e.g. `'querySchema' in Options`) working downstream.
 *
 * The per-field generics are still required for inference (TypeScript
 * cannot simultaneously infer a single `Options extends EndpointOptions`
 * generic AND provide a useful contextual type for `processResponse`'s
 * `data` parameter from the same literal). Once `Options` is synthesised
 * via this helper, every downstream type derivation references `Options`
 * directly — so new fields added to `BaseEndpointOptions` flow through
 * automatically without per-surface re-declaration in return types.
 */
export type OptionsFromInline<
  Method,
  Url,
  QuerySchema,
  RequestSchema,
  ResponseSchema,
  ErrorSchema,
  UrlParamsSchema,
  ResultModeT,
> = {
  method: Method
  url: Url
  responseSchema: ResponseSchema
} & (QuerySchema extends undefined ? {} : { querySchema: QuerySchema }) &
  (RequestSchema extends undefined ? {} : { requestSchema: RequestSchema }) &
  (ErrorSchema extends undefined ? {} : { errorSchema: ErrorSchema }) &
  (UrlParamsSchema extends undefined ? {} : { urlParamsSchema: UrlParamsSchema }) &
  (ResultModeT extends undefined ? {} : { result: ResultModeT })

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
