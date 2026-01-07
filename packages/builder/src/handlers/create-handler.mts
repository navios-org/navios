import type { ZodObject, ZodType } from 'zod/v4'

import type {
  BuilderContext,
  EndpointOptions,
  StreamOptions,
} from '../types/index.mjs'
import type { ErrorSchemaRecord } from '../types/error-schema.mjs'

import { handleError } from '../errors/handle-error.mjs'
import { bindUrlParams } from '../request/bind-url-params.mjs'
import { makeConfig } from '../request/make-config.mjs'

/**
 * Base request type for handler functions.
 * Includes urlParams, params (query), data (body), and request options.
 */
export interface HandlerRequest {
  urlParams?: Record<string, string | number>
  params?: Record<string, unknown>
  data?: unknown
  signal?: AbortSignal | null
  headers?: Record<string, string>
  [key: string]: unknown
}

export interface CreateHandlerOptions<Options extends EndpointOptions | StreamOptions> {
  options: Options
  context: BuilderContext
  isMultipart?: boolean
  responseSchema?: ZodType
  errorSchema?: ErrorSchemaRecord
  /** Optional Zod schema for validating URL parameters at runtime */
  urlParamsSchema?: ZodObject
  transformRequest?: (request: HandlerRequest) => HandlerRequest
  transformResponse?: (data: unknown) => unknown
}

export function createHandler<Options extends EndpointOptions | StreamOptions, TResponse>({
  options,
  context: { getClient, config },
  isMultipart = false,
  responseSchema,
  errorSchema,
  urlParamsSchema,
  transformRequest,
  transformResponse,
}: CreateHandlerOptions<Options>) {
  const { method, url } = options

  const handler = async (
    request: HandlerRequest = {} as HandlerRequest,
  ): Promise<TResponse> => {
    const client = getClient()
    const finalUrlPart = bindUrlParams<Options['url']>(url, request, urlParamsSchema)
    const finalRequest = transformRequest ? transformRequest(request) : request

    try {
      const result = await client.request(
        makeConfig(finalRequest, options, method, finalUrlPart, isMultipart),
      )

      const data = transformResponse ? transformResponse(result.data) : result.data

      return (responseSchema ? responseSchema.parse(data) : data) as TResponse
    } catch (error) {
      // handleError may return a parsed response (when useDiscriminatorResponse is true)
      // or throw an error
      return handleError(config, error, responseSchema, errorSchema) as TResponse
    }
  }

  handler.config = options

  return handler
}
