import type { Navios } from 'navios'
import type { AnyZodObject, z, ZodType } from 'zod'

import type {
  BaseEndpointConfig,
  BlobEndpointConfig,
  BlobRequestEndpoint,
  DeclareAPIConfig,
  NaviosZodRequest,
  UrlHasParams,
  UrlParams,
  Util_FlatObject,
  Util_FlatType,
} from './types.mjs'

import { NaviosZodError } from './NaviosZodError.mjs'
import { bindUrlParams } from './utils/bindUrlParams.mjs'
import { downloadBlob } from './utils/downloadBlob.mjs'
import { endpointCreator } from './utils/endpointCreator.mjs'

export type EndpointFunctionArgs<
  Url extends string,
  QuerySchema = undefined,
  RequestSchema = undefined,
> = (QuerySchema extends AnyZodObject
  ? {
      params: z.infer<QuerySchema>
    }
  : {}) &
  (RequestSchema extends ZodType
    ? {
        data: z.infer<RequestSchema>
      }
    : {}) &
  (UrlHasParams<Url> extends true
    ? {
        urlParams: UrlParams<Url>
      }
    : {})

export interface DeclareAPIInstance {
  provideClient(client: Navios): void
  getClient(): Navios

  declareEndpoint<
    Url extends string,
    Method extends 'POST' | 'PUT' | 'PATCH',
    QuerySchema extends AnyZodObject,
    ResponseSchema extends ZodType,
    RequestSchema extends ZodType,
  >(options: {
    method: Method
    url: Url
    querySchema: QuerySchema
    responseSchema: ResponseSchema
    requestSchema: RequestSchema
  }): ((
    params: Util_FlatObject<
      EndpointFunctionArgs<Url, QuerySchema, RequestSchema>
    >,
  ) => Promise<z.output<ResponseSchema>>) & {
    config: BaseEndpointConfig<
      Method,
      Url,
      QuerySchema,
      ResponseSchema,
      RequestSchema
    >
  }

  declareEndpoint<
    Url extends string,
    Method extends 'POST' | 'PUT' | 'PATCH',
    ResponseSchema extends ZodType,
    RequestSchema extends ZodType,
  >(options: {
    method: Method
    url: Url
    responseSchema: ResponseSchema
    requestSchema: RequestSchema
  }): ((
    params: Util_FlatObject<
      EndpointFunctionArgs<Url, undefined, RequestSchema>
    >,
  ) => Promise<z.output<ResponseSchema>>) & {
    config: BaseEndpointConfig<
      Method,
      Url,
      undefined,
      ResponseSchema,
      RequestSchema
    >
  }

  declareEndpoint<
    Url extends string,
    Method extends 'POST' | 'PUT' | 'PATCH',
    ResponseSchema extends ZodType,
  >(options: {
    method: Method
    url: Url
    responseSchema: ResponseSchema
  }): ((
    params: Util_FlatObject<EndpointFunctionArgs<Url, undefined, undefined>>,
  ) => Promise<z.output<ResponseSchema>>) & {
    config: BaseEndpointConfig<
      Method,
      Url,
      undefined,
      ResponseSchema,
      undefined
    >
  }

  declareEndpoint<
    Url extends string,
    QuerySchema extends AnyZodObject,
    Method extends 'GET' | 'DELETE' | 'OPTIONS' | 'HEAD',
    ResponseSchema extends ZodType,
  >(options: {
    method: Method
    url: Url
    querySchema: QuerySchema
    responseSchema: ResponseSchema
  }): ((
    params: Util_FlatObject<EndpointFunctionArgs<Url, QuerySchema, undefined>>,
  ) => Promise<z.output<ResponseSchema>>) & {
    config: BaseEndpointConfig<
      Method,
      Url,
      QuerySchema,
      ResponseSchema,
      undefined
    >
  }

  declareEndpoint<
    Url extends string,
    Method extends 'GET' | 'DELETE' | 'OPTIONS' | 'HEAD',
    ResponseSchema extends ZodType,
  >(options: {
    method: Method
    url: Url
    responseSchema: ResponseSchema
  }): ((
    params: Util_FlatObject<EndpointFunctionArgs<Url, undefined, undefined>>,
  ) => Promise<z.output<ResponseSchema>>) & {
    config: BaseEndpointConfig<
      Method,
      Url,
      undefined,
      ResponseSchema,
      undefined
    >
  }

  declareBlobEndpoint<Config extends BlobEndpointConfig>(
    options: Config,
  ): Util_FlatType<BlobRequestEndpoint<Config>>
}

export function declareAPI(config: DeclareAPIConfig = {}): DeclareAPIInstance {
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

  function declareEndpoint(options: BaseEndpointConfig) {
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

export type DeclareAPI = DeclareAPIInstance
