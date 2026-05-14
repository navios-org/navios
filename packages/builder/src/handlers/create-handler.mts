import { ZodError } from 'zod/v4'

import type { ZodObject, ZodType } from 'zod/v4'

import { classifyError } from '../errors/classify-error.mjs'
import { handleError } from '../errors/handle-error.mjs'
import { bindUrlParams } from '../request/bind-url-params.mjs'
import { makeConfig } from '../request/make-config.mjs'

import type { AbstractResponse } from '../types/common.mjs'
import type { ResponseMeta } from '../types/envelope.mjs'
import type { ErrorSchemaRecord } from '../types/error-schema.mjs'
import type { BuilderContext, EndpointOptions, StreamOptions } from '../types/index.mjs'

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

function toResponseMeta(r: {
  status: number
  statusText: string
  headers: Headers | Record<string, string>
}): ResponseMeta {
  const headers = r.headers instanceof Headers ? r.headers : new Headers(r.headers)
  return { status: r.status, statusText: r.statusText, headers }
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
  const resultMode =
    (options as { result?: 'data' | 'envelope' }).result ?? config.defaults?.result ?? 'data'
  const shouldValidate = (options as { validateResponse?: boolean }).validateResponse !== false

  const handler = async (request: HandlerRequest = {} as HandlerRequest): Promise<TResponse> => {
    const client = getClient()
    const finalUrlPart = bindUrlParams<Options['url']>(url, request, urlParamsSchema)
    const finalRequest = transformRequest ? transformRequest(request) : request

    if (resultMode === 'envelope') {
      try {
        const result = await client.request(
          makeConfig(finalRequest, options, method, finalUrlPart, isMultipart),
        )
        const raw = transformResponse ? transformResponse(result.data) : result.data
        try {
          const data = shouldValidate && responseSchema ? responseSchema.parse(raw) : raw
          return {
            ok: true,
            data,
            error: null,
            response: toResponseMeta(result),
          } as TResponse
        } catch (zerr) {
          // Validation or transform failed on a 2xx body. We already have a
          // successful HTTP response in hand, so any throw here is a validation
          // variant — keep Zod issues when available, empty list otherwise.
          if (config.onError) config.onError(zerr)
          const envError = {
            kind: 'validation' as const,
            status: result.status,
            issues: zerr instanceof ZodError ? zerr.issues : [],
            body: raw,
          }
          return {
            ok: false,
            data: null,
            error: envError,
            response: toResponseMeta(result),
          } as TResponse
        }
      } catch (err) {
        if (config.onError) config.onError(err)
        const envError = classifyError(err, errorSchema)
        const resp = (err as { response?: AbstractResponse<unknown> }).response
        return {
          ok: false,
          data: null,
          error: envError,
          response: resp ? toResponseMeta(resp) : null,
        } as TResponse
      }
    }

    // Legacy data mode — unchanged behaviour, plus validateResponse opt-out.
    try {
      const result = await client.request(
        makeConfig(finalRequest, options, method, finalUrlPart, isMultipart),
      )

      const data = transformResponse ? transformResponse(result.data) : result.data

      return (shouldValidate && responseSchema ? responseSchema.parse(data) : data) as TResponse
    } catch (error) {
      // handleError may return a parsed response (when useDiscriminatorResponse is true)
      // or throw an error
      return handleError(config, error, responseSchema, errorSchema) as TResponse
    }
  }

  handler.config = options

  return handler
}
