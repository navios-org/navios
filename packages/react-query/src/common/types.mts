import type {
  BuilderInstance,
  EndpointHandler,
  ErrorSchemaRecord,
  InferErrorSchemaOutput,
} from '@navios/builder'
import type { z, ZodType } from 'zod/v4'

/**
 * Splits a string by a delimiter into a tuple type.
 * Used for parsing URL paths into segments for query keys.
 */
export type Split<S extends string, D extends string> = string extends S
  ? string[]
  : S extends ''
    ? []
    : S extends `${infer T}${D}${infer U}`
      ? [T, ...Split<U, D>]
      : [S]

/**
 * Compute the response input type.
 * In the data-mode default (errors are thrown), this is just `z.output<ResponseSchema>`.
 *
 * @template ResponseSchema - The success response schema
 * @template ErrorSchema - The error schema record (unused; kept for backwards compatibility)
 */
export type ComputeResponseInput<
  ResponseSchema extends ZodType,
  _ErrorSchema extends ErrorSchemaRecord | undefined = undefined,
> = z.output<ResponseSchema>

/**
 * Options for creating a client instance.
 */
export type ClientOptions = {
  api: BuilderInstance
  defaults?: {
    keyPrefix?: string[]
    keySuffix?: string[]
  }
}

/**
 * Infers the full response type from an endpoint configuration.
 * Returns `ResponseType | ErrorTypes` if errorSchema exists,
 * otherwise just `ResponseType`.
 *
 * @example
 * ```ts
 * type Response = InferEndpointResponse<{
 *   responseSchema: z.ZodObject<{ data: z.ZodString }>,
 *   errorSchema: { 400: z.ZodObject<{ error: z.ZodString }> }
 * }>
 * // Result: { data: string } | { error: string }
 * ```
 */
export type InferEndpointResponse<
  Config extends {
    responseSchema: ZodType
    errorSchema?: ErrorSchemaRecord
  },
> = Config['errorSchema'] extends ErrorSchemaRecord
  ? z.output<Config['responseSchema']> | InferErrorSchemaOutput<Config['errorSchema']>
  : z.output<Config['responseSchema']>

/**
 * Returns true if an endpoint handler was declared with `result: 'envelope'`.
 *
 * Used by react-query helpers to switch type inference and unwrap behaviour
 * (see `unwrap` option) when the endpoint produces a `ResponseEnvelope` rather
 * than a parsed body.
 */
export type IsEnvelope<E> =
  E extends EndpointHandler<infer O> ? (O extends { result: 'envelope' } ? true : false) : false
