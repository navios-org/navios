import type { HttpMethod, Navios, NaviosResponse } from 'navios'
import type { AnyZodObject, z } from 'zod'

import { NaviosError } from 'navios'

import type {
  APIConfig,
  BlobEndpointConfig,
  BlobRequestEndpoint,
  DeclareAPIConfig,
  Endpoint,
  EndpointConfig,
  EndpointWithDataConfig,
  NaviosZodRequest,
  Util_FlatType,
} from './types.mjs'

import { NaviosZodError } from './NaviosZodError.mjs'
import { bindUrlParams } from './utils/bindUrlParams.mjs'
import { downloadBlob } from './utils/downloadBlob.mjs'
import { endpointCreator } from './utils/endpointCreator.mjs'

export function declareAPI(config: DeclareAPIConfig = {}) {
  let client: Navios | null = null

  function getClient() {
    if (!client) {
      throw new NaviosZodError('[Navios-Zod]: Client was not provided')
    }
    return client
  }

  /**
   * Declares a new endpoint that returns a blob
   *
   * This is useful for downloading files
   * Additionally, you can set the download flag to automatically download the file
   * Please note, that you should set the fileName in the request object if you want to use the download flag
   */
  function declareBlobEndpoint<Config extends BlobEndpointConfig>(
    options: Config,
  ): Util_FlatType<BlobRequestEndpoint<Config>> {
    const { method, url, download } = options
    // @ts-expect-error TS2322 We declare the correct type. Here is a stub
    return async (request: NaviosZodRequest<Config>) => {
      const client = getClient()

      const finalUrlPart = bindUrlParams<BlobEndpointConfig['url']>(
        url,
        request,
      )
      try {
        const result = await client.request<Blob>({
          ...request,
          params: options.querySchema
            ? // @ts-expect-error TS2339 We know that sometimes querySchema can generate a default value
              options.querySchema.parse(request.params)
            : {},
          method,
          url: finalUrlPart,
          responseType: 'blob',
        })
        if (!download) {
          return result
        }
        // @ts-expect-error TS2339 We know that fileName is set if download is set
        downloadBlob(result.data, request.fileName) //afterwards we remove the element again
        return result
      } catch (error) {
        throw error
      }
    }
  }

  function declareEndpoint<
    Config extends EndpointConfig | EndpointWithDataConfig,
  >(
    options: Config,
  ): Util_FlatType<Endpoint<Config>> & {
    config: Config
  } {
    return endpointCreator(options, {
      getClient,
      config,
    })
  }

  function provideClient(newClient: Navios) {
    client = newClient
  }

  return {
    declareEndpoint,
    declareBlobEndpoint,
    provideClient,
    getClient,
  }
}

export type DeclareAPI = ReturnType<typeof declareAPI>
