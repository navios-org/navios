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
