import type { ZodError, ZodType } from 'zod/v4'

import type { AbstractResponse, Client, HttpMethod } from './common.mjs'

export interface BuilderConfig {
  /**
   * If your schema uses discriminatedUnion which works for both success
   * and error responses, you can set this to true to use the discriminator
   * to parse error response using the same schema as success response.
   */
  useDiscriminatorResponse?: boolean

  /**
   * This method is used to process the error response or to format the
   * error message.
   * @param error unknown or NaviosError
   */
  onError?: (error: unknown) => void

  /**
   * This method is useful to handle the error with the zod schema.
   * You can use this to log the error or to show a message to the user.
   *
   * Please note that this method has lower priority than the onError method.
   * @param error ZodError
   * @param response original response
   * @param originalError original error
   */
  onZodError?: (
    error: ZodError,
    response: AbstractResponse<any> | undefined,
    originalError: unknown,
  ) => void
}

export interface BuilderContext {
  getClient: () => Client
  config: BuilderConfig
}

export interface BaseStreamConfig<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  QuerySchema = undefined,
  RequestSchema = undefined,
> {
  method: Method
  url: Url
  querySchema: QuerySchema
  requestSchema: RequestSchema
}

export interface BaseEndpointConfig<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  QuerySchema = undefined,
  ResponseSchema extends ZodType = ZodType,
  RequestSchema = undefined,
> extends BaseStreamConfig<Method, Url, QuerySchema, RequestSchema> {
  responseSchema: ResponseSchema
}

export type AnyStreamConfig = BaseStreamConfig<any, any, any, any>
export type AnyEndpointConfig = BaseEndpointConfig<any, any, any, any, any>
