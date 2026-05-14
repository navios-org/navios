import type {
  BaseEndpointOptions,
  EndpointHandler,
  EndpointOptions,
  EnvelopeError,
  ErrorSchemaRecord,
  ResponseEnvelope,
  StreamHandler,
} from '@navios/builder'
import type { z } from 'zod/v4'

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
 *
 * @template Options - EndpointOptions from builder (const generic pattern)
 */
export type EndpointHelper<Options extends EndpointOptions> = {
  endpoint: EndpointHandler<Options>
}

/**
 * Helper type that attaches a stream endpoint to mutation results.
 *
 * @template Options - BaseEndpointOptions from builder (const generic pattern)
 */
export type StreamHelper<Options extends BaseEndpointOptions> = {
  endpoint: StreamHandler<Options>
}
