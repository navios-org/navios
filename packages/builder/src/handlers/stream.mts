import type { BaseStreamConfig, BuilderContext, NaviosZodRequest } from '../types/index.mjs'

import { createHandler } from './create-handler.mjs'

/**
 * Creates a stream handler function for downloading files as Blob.
 *
 * The returned function will:
 * - Validate request data against `requestSchema` (if provided)
 * - Validate query parameters against `querySchema` (if provided)
 * - Make the HTTP request with `responseType: 'blob'`
 * - Return the response as a Blob
 *
 * @param options - Stream endpoint configuration
 * @param options.method - HTTP method
 * @param options.url - URL pattern with optional parameters (e.g., '/files/$fileId')
 * @param options.requestSchema - Optional Zod schema for validating request body (POST, PUT, PATCH only)
 * @param options.querySchema - Optional Zod schema for validating query parameters
 * @param context - Builder context containing client getter and configuration
 * @returns A function that makes the HTTP request and returns a Blob
 *
 * @example
 * ```ts
 * const downloadFile = createStream({
 *   method: 'GET',
 *   url: '/files/$fileId',
 *   querySchema: z.object({ format: z.enum(['pdf', 'docx']) })
 * }, context)
 *
 * const blob = await downloadFile({
 *   urlParams: { fileId: '123' },
 *   params: { format: 'pdf' }
 * })
 * ```
 */
export function createStream<Config extends BaseStreamConfig>(
  options: Config,
  context: BuilderContext,
) {
  return createHandler<Config, Blob>({
    options,
    context,
    transformRequest: (request: NaviosZodRequest<Config>) => ({
      responseType: 'blob',
      ...request,
    }),
    transformResponse: (data) => data as Blob,
  })
}
