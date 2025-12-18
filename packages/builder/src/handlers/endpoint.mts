import type { z } from 'zod/v4'

import type { BaseEndpointConfig, BuilderContext } from '../types/index.mjs'

import { createHandler } from './create-handler.mjs'

/**
 * Creates an endpoint handler function with request/response validation.
 *
 * The returned function will:
 * - Validate request data against `requestSchema` (if provided)
 * - Validate query parameters against `querySchema` (if provided)
 * - Make the HTTP request using the configured client
 * - Validate and parse the response against `responseSchema`
 * - Handle errors according to the builder configuration
 *
 * @param options - Endpoint configuration
 * @param options.method - HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)
 * @param options.url - URL pattern with optional parameters (e.g., '/users/$userId')
 * @param options.responseSchema - Zod schema for validating the response
 * @param options.requestSchema - Optional Zod schema for validating request body (POST, PUT, PATCH only)
 * @param options.querySchema - Optional Zod schema for validating query parameters
 * @param context - Builder context containing client getter and configuration
 * @returns A function that makes the HTTP request and returns validated response data
 *
 * @example
 * ```ts
 * const getUser = createEndpoint({
 *   method: 'GET',
 *   url: '/users/$userId',
 *   responseSchema: z.object({ id: z.string(), name: z.string() })
 * }, context)
 *
 * const user = await getUser({ urlParams: { userId: '123' } })
 * ```
 */
export function createEndpoint<Config extends BaseEndpointConfig>(
  options: Config,
  context: BuilderContext,
) {
  return createHandler<Config, z.output<Config['responseSchema']>>({
    options,
    context,
    responseSchema: options.responseSchema,
  })
}
