import type {
  BaseEndpointConfig,
  BuilderContext,
  NaviosZodRequest,
} from '../types.mjs'

import { bindUrlParams } from './bind-url-params.mjs'
import { handleException } from './handle-exception.mjs'
import { makeRequestConfig } from './make-request-config.mjs'

export function multipartCreator<Config extends BaseEndpointConfig>(
  options: Config,
  { getClient, config }: BuilderContext,
) {
  const { method, url, responseSchema } = options
  const handler = async (
    request: NaviosZodRequest<Config> = {} as NaviosZodRequest<Config>,
  ) => {
    const client = getClient()

    const finalUrlPart = bindUrlParams<Config['url']>(url, request)
    try {
      const result = await client.request(
        makeRequestConfig(request, options, method, finalUrlPart, true),
      )
      return responseSchema.parse(result.data)
    } catch (error) {
      return handleException(config, error, responseSchema)
    }
  }
  handler.config = options

  return handler
}
