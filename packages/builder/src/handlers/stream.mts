import type {
  ErrorSchemaRecord,
  InferErrorSchemaOutput,
} from '../types/error-schema.mjs'
import type { BaseEndpointOptions, BuilderContext } from '../types/index.mjs'

import { createHandler } from './create-handler.mjs'

/**
 * Determines the return type for a stream based on errorSchema.
 * When errorSchema is present, returns a union of Blob and error types.
 */
type StreamReturnType<Config extends BaseEndpointOptions> =
  Config['errorSchema'] extends ErrorSchemaRecord
    ? Blob | InferErrorSchemaOutput<Config['errorSchema']>
    : Blob

/**
 * Creates a stream handler function for downloading files as Blob.
 *
 * The returned function will:
 * - Validate request data against `requestSchema` (if provided)
 * - Validate query parameters against `querySchema` (if provided)
 * - Make the HTTP request with `responseType: 'blob'`
 * - Return the response as a Blob
 * - Handle errors according to errorSchema if provided
 *
 * @param options - Stream endpoint configuration
 * @param options.method - HTTP method
 * @param options.url - URL pattern with optional parameters (e.g., '/files/$fileId')
 * @param options.requestSchema - Optional Zod schema for validating request body (POST, PUT, PATCH only)
 * @param options.querySchema - Optional Zod schema for validating query parameters
 * @param options.errorSchema - Optional record mapping status codes to Zod schemas for error responses
 * @param context - Builder context containing client getter and configuration
 * @returns A function that makes the HTTP request and returns a Blob or error response
 *
 * @example
 * ```ts
 * const downloadFile = createStream({
 *   method: 'GET',
 *   url: '/files/$fileId',
 *   querySchema: z.object({ format: z.enum(['pdf', 'docx']) }),
 *   errorSchema: {
 *     404: z.object({ error: z.literal('File not found') })
 *   }
 * }, context)
 *
 * const result = await downloadFile({
 *   urlParams: { fileId: '123' },
 *   params: { format: 'pdf' }
 * })
 *
 * if (result instanceof Blob) {
 *   // Success - save file
 * } else {
 *   // Error response
 *   console.error(result.error)
 * }
 * ```
 */
export function createStream<Config extends BaseEndpointOptions>(
  options: Config,
  context: BuilderContext,
) {
  return createHandler<Config, StreamReturnType<Config>>({
    options,
    context,
    errorSchema: options.errorSchema,
    urlParamsSchema: options.urlParamsSchema,
    transformRequest: (request) => ({
      responseType: 'blob',
      ...request,
    }),
    transformResponse: (data) => data as Blob,
  })
}
