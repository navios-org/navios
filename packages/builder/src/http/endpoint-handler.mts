import type { InferSchemaInput, InferSchemaOutput, Schema } from '../shared/schema.mjs'
import type { RequiredKeys } from '../shared/type-helpers.mjs'

import type { Client } from './client.mjs'
import type { EndpointErrorOf } from './endpoint-error.mjs'
import type {
  BaseEndpointOptions,
  EndpointResponseKind,
  SuccessSchemaRecord,
} from './endpoint-options.mjs'
import type { ErrorSchemaRecord, MergeErrorSchemas } from './error-schema.mjs'
import type { ClientRequestArgs } from './request-args.mjs'
import type { SafeResult } from './safe-result.mjs'

// =============================================================================
// Inference
// =============================================================================

/**
 * The value an endpoint resolves to, derived from its `response` kind and
 * `responseSchema`.
 */
export type InferEndpointReturn<Options extends BaseEndpointOptions> = Options extends {
  response: 'blob'
}
  ? Blob
  : Options extends { response: 'text' }
    ? string
    : Options extends { response: 'stream' }
      ? ReadableStream<Uint8Array>
      : Options extends { response: 'void' }
        ? undefined
        : Options extends { validateResponse: false }
          ? // Validation is skipped, so the body arrives as the server sent it:
            // the schemas' input shape, without their transforms or defaults.
            Options['responses'] extends SuccessSchemaRecord
            ? InferSuccessInput<Options['responses']>
            : Options['responseSchema'] extends Schema
              ? InferSchemaInput<Options['responseSchema']>
              : unknown
          : Options['responses'] extends SuccessSchemaRecord
            ? InferSuccessOutput<Options['responses']>
            : Options['responseSchema'] extends Schema
              ? InferSchemaOutput<Options['responseSchema']>
              : unknown

/**
 * Like {@link InferSuccessOutput}, with each schema's input type: what the
 * call resolves to when `validateResponse` is `false`.
 */
export type InferSuccessInput<R extends SuccessSchemaRecord> = {
  [K in keyof R]: R[K] extends Schema ? InferSchemaInput<R[K]> : undefined
}[keyof R]

/**
 * Union of what each status in a `responses` map resolves to: the schema's
 * output, or `undefined` for a `null` entry.
 */
export type InferSuccessOutput<R extends SuccessSchemaRecord> = {
  [K in keyof R]: R[K] extends Schema ? InferSchemaOutput<R[K]> : undefined
}[keyof R]

/**
 * The error an endpoint throws (and `safe()` returns), typed from its
 * `errorSchema`.
 */
export type InferEndpointError<Options extends BaseEndpointOptions> = EndpointErrorOf<
  Options['errorSchema'] extends ErrorSchemaRecord ? Options['errorSchema'] : undefined
>

/**
 * The options of an endpoint as a builder with shared error schemas declares
 * it: `errorSchema` is the builder's, merged under the endpoint's own. On a
 * builder without shared schemas it is `Options` unchanged.
 */
export type WithBuilderErrors<
  Options extends BaseEndpointOptions,
  Errors extends ErrorSchemaRecord,
> = [keyof Errors] extends [never]
  ? Options
  : Omit<Options, 'errorSchema'> & {
      readonly errorSchema: MergeErrorSchemas<Errors, Options['errorSchema']>
    }

/** What `endpoint.safe(args)` resolves to. */
export type InferEndpointSafeResult<Options extends BaseEndpointOptions> = SafeResult<
  InferEndpointReturn<Options>,
  InferEndpointError<Options>
>

/** Options accepted as the second argument of an endpoint call. */
export interface EndpointCallOptions {
  /**
   * HTTP client for this call only. Use it for per-request clients in SSR
   * (cookies, auth) without touching the builder's shared client.
   */
  client?: Client
}

/**
 * Call signature of an endpoint: the args object is optional when the
 * endpoint has no URL params, query schema or request schema.
 */
export type EndpointCallArgs<Options extends BaseEndpointOptions> = [
  RequiredKeys<ClientRequestArgs<Options>>,
] extends [never]
  ? [args?: ClientRequestArgs<Options>, options?: EndpointCallOptions]
  : [args: ClientRequestArgs<Options>, options?: EndpointCallOptions]

/**
 * The handler returned by `declareEndpoint`.
 *
 * - `endpoint(args)` resolves to the data and **throws** an `EndpointError`
 *   on any failure.
 * - `endpoint.safe(args)` **never throws**: it resolves to a `SafeResult`
 *   carrying either the data or the same `EndpointError`.
 * - `endpoint.config` is the options object the endpoint was declared with.
 *
 * @example
 * ```ts
 * const user = await getUser({ urlParams: { userId: '123' } })
 *
 * const res = await getUser.safe({ urlParams: { userId: '123' } })
 * if (res.ok) res.data
 * else res.error.kind
 * ```
 */
export type EndpointHandler<Options extends BaseEndpointOptions> = ((
  ...args: EndpointCallArgs<Options>
) => Promise<InferEndpointReturn<Options>>) & {
  safe: (...args: EndpointCallArgs<Options>) => Promise<InferEndpointSafeResult<Options>>
  config: Options
}

type NonJsonResponse = Exclude<EndpointResponseKind, 'json'>

/**
 * Options that contradict others of the same declaration. Both have to be there
 * for certain: a key that may be missing, or has no value, contradicts nothing.
 */
type ContradictoryKeys<Options> =
  | (Options extends { responses: SuccessSchemaRecord; responseSchema: Schema }
      ? 'responseSchema'
      : never)
  | (Options extends { response: NonJsonResponse; responseSchema: Schema }
      ? 'responseSchema'
      : never)
  | (Options extends { response: NonJsonResponse; responses: SuccessSchemaRecord }
      ? 'responses'
      : never)
  | (Options extends { method: 'GET' | 'HEAD'; requestSchema: Schema } ? 'requestSchema' : never)
  | (Options extends { method: 'GET' | 'HEAD'; body: 'multipart' } ? 'body' : never)

/**
 * Checks that the options of a declaration go together:
 *
 * - `responseSchema` is required unless the endpoint declares a non-JSON
 *   `response` kind or a per-status `responses` map
 * - `responses` takes the place of `responseSchema`
 * - a non-JSON `response` is not validated, so it has neither
 * - a `GET` or `HEAD` request has no body
 *
 * A schema that is there is not mentioned in the result: intersecting it with
 * `Schema` would cost the compiler a new type for every endpoint. `Extract`
 * keeps the mapped type from being a place `Options` is inferred from.
 */
export type RequireResponseSchema<Options> = (Options extends
  | { responseSchema: Schema }
  | { response: NonJsonResponse }
  | { responses: SuccessSchemaRecord }
  ? {}
  : { responseSchema: Schema }) & {
  [K in Extract<keyof Options, ContradictoryKeys<Options>>]: never
}

/**
 * Rejects option keys the builder does not know. Inference through a generic
 * parameter skips TypeScript's excess-property check, so without this a typo
 * (`requstSchema`) or a removed option would be accepted and silently ignored.
 */
export type NoUnknownOptions<Options, Known = BaseEndpointOptions> = {
  [K in Exclude<keyof Options, keyof Known>]: never
}

// =============================================================================
// Helper Types for External Use
// =============================================================================

/**
 * Extracts the args type from an endpoint declaration.
 *
 * @example
 * ```ts
 * const getUser = api.declareEndpoint({ ... })
 * type Args = EndpointParams<typeof getUser>
 * ```
 */
export type EndpointParams<T> = T extends { config: infer C extends BaseEndpointOptions }
  ? ClientRequestArgs<C>
  : never

/**
 * Extracts the resolved data type from an endpoint declaration.
 */
export type EndpointResult<T> = T extends { config: infer C extends BaseEndpointOptions }
  ? InferEndpointReturn<C>
  : never

/**
 * Extracts the typed error from an endpoint declaration.
 */
export type EndpointErrorType<T> = T extends { config: infer C extends BaseEndpointOptions }
  ? InferEndpointError<C>
  : never

/**
 * Extracts the config type from an endpoint declaration.
 */
export type EndpointConfig<T> = T extends { config: infer C } ? C : never
