import type { z, ZodObject, ZodType } from 'zod/v4'

import type {
  BaseEndpointConfig,
  BaseStreamConfig,
  Client,
  EndpointFunctionArgs,
  Util_FlatObject,
} from '../types.mjs'

export interface BuilderInstance {
  provideClient(client: Client): void

  getClient(): Client

  declareEndpoint<
    Url extends string,
    Method extends 'POST' | 'PUT' | 'PATCH',
    QuerySchema extends ZodObject,
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
    QuerySchema extends ZodObject,
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

  // Multipart

  declareMultipart<
    Url extends string,
    Method extends 'POST' | 'PUT' | 'PATCH',
    QuerySchema extends ZodObject,
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

  declareMultipart<
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

  declareMultipart<
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

  // Streams

  declareStream<
    Url extends string,
    Method extends 'POST' | 'PUT' | 'PATCH',
    QuerySchema extends ZodObject,
    RequestSchema extends ZodType,
  >(options: {
    method: Method
    url: Url
    querySchema: QuerySchema
    requestSchema: RequestSchema
  }): ((
    params: Util_FlatObject<
      EndpointFunctionArgs<Url, QuerySchema, RequestSchema>
    >,
  ) => Promise<Blob>) & {
    config: BaseStreamConfig<Method, Url, QuerySchema, RequestSchema>
  }

  declareStream<
    Url extends string,
    Method extends 'POST' | 'PUT' | 'PATCH',
    RequestSchema extends ZodType,
  >(options: {
    method: Method
    url: Url
    requestSchema: RequestSchema
  }): ((
    params: Util_FlatObject<
      EndpointFunctionArgs<Url, undefined, RequestSchema>
    >,
  ) => Promise<Blob>) & {
    config: BaseStreamConfig<Method, Url, undefined, RequestSchema>
  }

  declareStream<
    Url extends string,
    Method extends 'POST' | 'PUT' | 'PATCH',
  >(options: {
    method: Method
    url: Url
  }): ((
    params: Util_FlatObject<EndpointFunctionArgs<Url>>,
  ) => Promise<Blob>) & {
    config: BaseStreamConfig<Method, Url>
  }

  declareStream<
    Url extends string,
    QuerySchema extends ZodObject,
    Method extends 'GET' | 'DELETE' | 'OPTIONS' | 'HEAD',
  >(options: {
    method: Method
    url: Url
    querySchema: QuerySchema
  }): ((
    params: Util_FlatObject<EndpointFunctionArgs<Url, QuerySchema>>,
  ) => Promise<Blob>) & {
    config: BaseStreamConfig<Method, Url, QuerySchema>
  }

  declareStream<
    Url extends string,
    Method extends 'GET' | 'DELETE' | 'OPTIONS' | 'HEAD',
  >(options: {
    method: Method
    url: Url
  }): ((
    params: Util_FlatObject<EndpointFunctionArgs<Url>>,
  ) => Promise<Blob>) & {
    config: BaseStreamConfig<Method, Url>
  }
}
