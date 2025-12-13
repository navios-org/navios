import type { ZodType } from 'zod/v4'

import type {
  BaseStreamConfig,
  BuilderContext,
  NaviosZodRequest,
} from '../types/index.mjs'

import { handleError } from '../errors/handle-error.mjs'
import { bindUrlParams } from '../request/bind-url-params.mjs'
import { makeConfig } from '../request/make-config.mjs'

export interface CreateHandlerOptions<Config extends BaseStreamConfig> {
  options: Config
  context: BuilderContext
  isMultipart?: boolean
  responseSchema?: ZodType
  transformRequest?: (request: NaviosZodRequest<Config>) => NaviosZodRequest<Config>
  transformResponse?: (data: unknown) => unknown
}

export function createHandler<Config extends BaseStreamConfig, TResponse>({
  options,
  context: { getClient, config },
  isMultipart = false,
  responseSchema,
  transformRequest,
  transformResponse,
}: CreateHandlerOptions<Config>) {
  const { method, url } = options

  const handler = async (
    request: NaviosZodRequest<Config> = {} as NaviosZodRequest<Config>,
  ): Promise<TResponse> => {
    const client = getClient()
    const finalUrlPart = bindUrlParams<Config['url']>(url, request)
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
      return handleError(config, error, responseSchema) as TResponse
    }
  }

  handler.config = options

  return handler
}
