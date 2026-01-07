import type { z } from 'zod/v4'

import type {
  ErrorSchemaRecord,
  InferErrorSchemaOutput,
} from '../types/error-schema.mjs'
import type { BuilderContext, EndpointOptions } from '../types/index.mjs'

import { createHandler } from './create-handler.mjs'

/**
 * Determines the return type for an endpoint based on responseSchema and errorSchema.
 * When errorSchema is present, returns a union of success and error types.
 */
type EndpointReturnType<Config extends EndpointOptions> =
  Config['errorSchema'] extends ErrorSchemaRecord
    ?
        | z.output<Config['responseSchema']>
        | InferErrorSchemaOutput<Config['errorSchema']>
    : z.output<Config['responseSchema']>

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
 * @param options.errorSchema - Optional record mapping status codes to Zod schemas for error responses
 * @param context - Builder context containing client getter and configuration
 * @returns A function that makes the HTTP request and returns validated response data
 *
 * @example
 * ```ts
 * const getUser = createEndpoint({
 *   method: 'GET',
 *   url: '/users/$userId',
 *   responseSchema: z.object({ id: z.string(), name: z.string() }),
 *   errorSchema: {
 *     404: z.object({ error: z.literal('User not found') })
 *   }
 * }, context)
 *
 * const user = await getUser({ urlParams: { userId: '123' } })
 * ```
 */
export function createEndpoint<Config extends EndpointOptions>(
  options: Config,
  context: BuilderContext,
) {
  return createHandler<Config, EndpointReturnType<Config>>({
    options,
    context,
    responseSchema: options.responseSchema,
    errorSchema: options.errorSchema,
    urlParamsSchema: options.urlParamsSchema,
  })
}
