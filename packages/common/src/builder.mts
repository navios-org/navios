import type { AnyZodObject, z, ZodType } from 'zod'

import type {
  BaseEndpointConfig,
  BuilderConfig,
  Client,
  EndpointFunctionArgs,
  Util_FlatObject,
} from './types.mjs'

import { NaviosException } from './exceptions/index.mjs'
import { endpointCreator } from './utils/index.mjs'

export interface BuilderInstance {
  provideClient(client: Client): void
  getClient(): Client

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
    params: Util_FlatObject<EndpointFunctionArgs<Url>>,
  ) => Promise<z.output<ResponseSchema>>) & {
    config: BaseEndpointConfig<Method, Url, undefined, ResponseSchema>
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
    params: Util_FlatObject<EndpointFunctionArgs<Url, QuerySchema>>,
  ) => Promise<z.output<ResponseSchema>>) & {
    config: BaseEndpointConfig<Method, Url, QuerySchema, ResponseSchema>
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
    params: Util_FlatObject<EndpointFunctionArgs<Url>>,
  ) => Promise<z.output<ResponseSchema>>) & {
    config: BaseEndpointConfig<Method, Url, undefined, ResponseSchema>
  }
}

export function builder(config: BuilderConfig = {}): BuilderInstance {
  let client: Client | null = null

  function getClient() {
    if (!client) {
      throw new NaviosException('[Navios-API]: Client was not provided')
    }
    return client
  }

  function declareEndpoint(options: BaseEndpointConfig) {
    return endpointCreator(options, {
      getClient,
      config,
    })
  }

  function provideClient(newClient: Client) {
    client = newClient
  }

  return {
    declareEndpoint,
    provideClient,
    getClient,
  }
}
