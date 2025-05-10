import type { AnyZodObject, z, ZodError, ZodType } from 'zod'

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

export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'PATCH'
  | 'HEAD'
  | 'OPTIONS'

export interface AbstractResponse<T> {
  data: T
  status: number
  statusText: string
  headers: Record<string, string> | Headers
}

export interface AbstractRequestConfig {
  params?: Record<string, unknown> | URLSearchParams
  method?: HttpMethod
  url: string
  data?: any
  headers?: Record<string, string>
  signal?: AbortSignal | null
  [key: string]: any
}

export interface Client {
  request: <T = unknown>(
    config: AbstractRequestConfig,
  ) => Promise<AbstractResponse<T>>
}

export type ParsePathParams<
  T extends string,
  TAcc = never,
> = T extends `${string}$${infer TPossiblyParam}`
  ? TPossiblyParam extends `${infer TParam}/${infer TRest}`
    ? ParsePathParams<TRest, TParam extends '' ? '_splat' : TParam | TAcc>
    : TPossiblyParam extends ''
      ? '_splat'
      : TPossiblyParam | TAcc
  : TAcc

export type UrlParams<Url extends string> = {
  [key in ParsePathParams<Url>]: string | number
}

export type UrlHasParams<Url extends string> =
  ParsePathParams<Url> extends never ? false : true

export interface NaviosZodRequestBase
  extends Pick<AbstractRequestConfig, 'signal' | 'headers'> {
  [key: string]: any
}

export type NaviosZodRequest<Config extends BaseEndpointConfig> = (UrlHasParams<
  Config['url']
> extends true
  ? { urlParams: UrlParams<Config['url']> }
  : {}) &
  (Config extends EndpointWithDataConfig
    ? Config['requestSchema'] extends AnyZodObject
      ? { data: z.input<Config['requestSchema']> }
      : {}
    : {}) &
  (Config['querySchema'] extends AnyZodObject
    ? { params: z.input<Config['querySchema']> }
    : {}) &
  NaviosZodRequestBase

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
    : {}) &
  NaviosZodRequestBase

export type BaseEndpointConfig<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  QuerySchema = undefined,
  ResponseSchema extends ZodType = ZodType,
  RequestSchema = undefined,
> = {
  method: Method
  url: Url
  responseSchema: ResponseSchema
  querySchema: QuerySchema
  requestSchema: RequestSchema
}
export interface EndpointConfig extends BaseEndpointConfig {}

export interface EndpointWithDataConfig
  extends BaseEndpointConfig<'POST' | 'PUT' | 'PATCH'> {}

export type RequiredRequestEndpoint<
  Config extends EndpointConfig | EndpointWithDataConfig,
> = (
  request: NaviosZodRequest<Config>,
) => Promise<z.infer<EndpointResponseSchema<Config>>>

export type Util_FlatObject<T> = T extends object
  ? { [K in keyof T]: K extends 'urlParams' ? Util_FlatObject<T[K]> : T[K] }
  : T

export type EndpointResponseSchema<Config extends EndpointConfig> =
  Config['responseSchema']

export type AnyEndpointConfig = BaseEndpointConfig<any, any, any, any, any>

export type AbstractEndpoint<Config extends AnyEndpointConfig> = ((
  params: any,
) => Promise<z.infer<Config['responseSchema']>>) & {
  config: Config
}
