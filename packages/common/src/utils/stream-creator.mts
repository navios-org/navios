import type {
  BaseStreamConfig,
  BuilderContext,
  NaviosZodRequest,
} from '../types.mjs'

import { bindUrlParams } from './bind-url-params.mjs'
import { handleException } from './handle-exception.mjs'
import { makeRequestConfig } from './make-request-config.mjs'

export function streamCreator<Config extends BaseStreamConfig>(
  options: Config,
  { getClient, config }: BuilderContext,
) {
  const { method, url } = options
  const handler = async (
    request: NaviosZodRequest<Config> = {} as NaviosZodRequest<Config>,
  ) => {
    const client = getClient()

    const finalUrlPart = bindUrlParams<Config['url']>(url, request)
    try {
      const result = await client.request(
        makeRequestConfig(
          {
            responseType: 'blob',
            ...request,
          },
          options,
          method,
          finalUrlPart,
        ),
      )
      return result.data
    } catch (error) {
      return handleException(config, error)
    }
  }
  handler.config = options

  return handler
}
