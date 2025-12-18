import type { z } from 'zod/v4'

import type { BaseEndpointConfig, BuilderContext } from '../types/index.mjs'

import { createHandler } from './create-handler.mjs'

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
 *
 * @param options - Multipart endpoint configuration
 * @param options.method - HTTP method (POST, PUT, or PATCH)
 * @param options.url - URL pattern with optional parameters (e.g., '/upload/$userId')
 * @param options.responseSchema - Zod schema for validating the response
 * @param options.requestSchema - Optional Zod schema for validating request data (should include File types)
 * @param options.querySchema - Optional Zod schema for validating query parameters
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
 *   responseSchema: z.object({ id: z.string(), url: z.string() })
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
export function createMultipart<Config extends BaseEndpointConfig>(
  options: Config,
  context: BuilderContext,
) {
  return createHandler<Config, z.output<Config['responseSchema']>>({
    options,
    context,
    isMultipart: true,
    responseSchema: options.responseSchema,
  })
}
