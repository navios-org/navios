import type {
  BuilderInstance,
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
 * Function type for processing API responses before returning to the caller.
 */
export type ProcessResponseFunction<TData = unknown, TVariables = unknown> = (
  variables: TVariables,
) => Promise<TData> | TData

/**
 * Compute the response input type based on discriminator and error schema.
 * When UseDiscriminator=true and errorSchema is present, errors are included as a union.
 * When UseDiscriminator=false, only the success type is returned (errors are thrown).
 *
 * @template UseDiscriminator - Whether to include error types in the response union
 * @template ResponseSchema - The success response schema
 * @template ErrorSchema - The error schema record (optional)
 */
export type ComputeResponseInput<
  UseDiscriminator extends boolean,
  ResponseSchema extends ZodType,
  ErrorSchema extends ErrorSchemaRecord | undefined,
> = UseDiscriminator extends true
  ? ErrorSchema extends ErrorSchemaRecord
    ? z.output<ResponseSchema> | InferErrorSchemaOutput<ErrorSchema>
    : z.output<ResponseSchema>
  : z.output<ResponseSchema>

/**
 * Options for creating a client instance.
 *
 * @template UseDiscriminator - When `true`, errors are returned as union types.
 *   When `false` (default), errors are thrown.
 */
export type ClientOptions<UseDiscriminator extends boolean = false> = {
  api: BuilderInstance<UseDiscriminator>
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
 * Computes the Result type, applying processResponse transformation
 * to the full response (including error union when present).
 */
export type ComputeResultType<
  ResponseSchema extends ZodType,
  ErrorSchema extends ErrorSchemaRecord | undefined,
  ProcessedResult,
> = ProcessedResult extends undefined
  ? ErrorSchema extends ErrorSchemaRecord
    ? z.output<ResponseSchema> | InferErrorSchemaOutput<ErrorSchema>
    : z.output<ResponseSchema>
  : ProcessedResult
