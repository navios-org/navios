import type { z } from 'zod/v4'

import type { ErrorSchemaRecord, InferErrorSchemaOutput } from '../types/error-schema.mjs'
import type { BuilderContext, EndpointOptions } from '../types/index.mjs'

import { createHandler } from './create-handler.mjs'

/**
 * Determines the return type for a multipart endpoint based on responseSchema and errorSchema.
 * When errorSchema is present, returns a union of success and error types.
 */
type MultipartReturnType<Config extends EndpointOptions> =
  Config['errorSchema'] extends ErrorSchemaRecord
    ? z.output<Config['responseSchema']> | InferErrorSchemaOutput<Config['errorSchema']>
    : z.output<Config['responseSchema']>

/**
 * Creates a multipart/form-data handler function for file uploads.
 *
 * The returned function will:
 * - Validate request data against `requestSchema` (if provided)
 * - Convert the request data to FormData automatically
 * - Handle File instances and other data types appropriately
 * - Validate query parameters against `querySchema` (if provided)
 * - Make the HTTP request with FormData
 * - Validate and parse the response against `responseSchema`
 * - Handle errors according to errorSchema if provided
 *
 * @param options - Multipart endpoint configuration
 * @param options.method - HTTP method (POST, PUT, or PATCH)
 * @param options.url - URL pattern with optional parameters (e.g., '/upload/$userId')
 * @param options.responseSchema - Zod schema for validating the response
 * @param options.requestSchema - Optional Zod schema for validating request data (should include File types)
 * @param options.querySchema - Optional Zod schema for validating query parameters
 * @param options.errorSchema - Optional record mapping status codes to Zod schemas for error responses
 * @param context - Builder context containing client getter and configuration
 * @returns A function that makes the HTTP request with FormData and returns validated response data
 *
 * @example
 * ```ts
 * const uploadFile = createMultipart({
 *   method: 'POST',
 *   url: '/upload',
 *   requestSchema: z.object({
 *     file: z.instanceof(File),
 *     description: z.string()
 *   }),
 *   responseSchema: z.object({ id: z.string(), url: z.string() }),
 *   errorSchema: {
 *     413: z.object({ error: z.literal('File too large') })
 *   }
 * }, context)
 *
 * const result = await uploadFile({
 *   data: {
 *     file: new File(['content'], 'file.txt'),
 *     description: 'My file'
 *   }
 * })
 * ```
 */
export function createMultipart<Config extends EndpointOptions>(
  options: Config,
  context: BuilderContext,
) {
  return createHandler<Config, MultipartReturnType<Config>>({
    options,
    context,
    isMultipart: true,
    responseSchema: options.responseSchema,
    errorSchema: options.errorSchema,
    urlParamsSchema: options.urlParamsSchema,
  })
}
