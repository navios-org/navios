import type {
  HttpMethod,
  NaviosConfig,
  NaviosError,
  NaviosResponse,
} from 'navios'
import type {
  AnyZodObject,
  z,
  ZodDiscriminatedUnion,
  ZodError,
  ZodType,
} from 'zod'

export interface DeclareAPIConfig {
  /**
   * If your schema uses discriminatedUnion which works for both success
   * and error responses, you can set this to true to use the discriminator
   * to parse error response using the same schema as success response.
   */
  useDiscriminatorResponse?: boolean

  /**
   * If you want to use the whole response object instead of just the data
   * for the response schema, you can set this to true.
   */
  useWholeResponse?: boolean

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
    response: NaviosResponse<any> | undefined,
    originalError: NaviosError | unknown,
  ) => void
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

export interface NaviosZodRequestBase extends RequestInit {
  headers?: Record<string, string>
  baseURL?: string
  validateStatus?: (status: number) => boolean
}

export type NaviosZodRequest<
  Config extends EndpointConfig | BlobEndpointConfig,
> = (UrlHasParams<Config['url']> extends true
  ? { urlParams: UrlParams<Config['url']> }
  : {}) &
  (Config extends BlobEndpointConfig
    ? Config['download'] extends true
      ? { fileName: string }
      : {}
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

export interface APIConfig extends DeclareAPIConfig {
  baseURL: string
  adapter?: NaviosConfig['adapter']
  headers?: Record<string, string>
}

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

export interface BlobEndpointConfig {
  method: 'GET'
  url: string
  querySchema?: AnyZodObject
  download: boolean
}

export type RequiredRequestEndpoint<
  Config extends EndpointConfig | EndpointWithDataConfig,
> = (
  request: NaviosZodRequest<Config>,
) => Promise<z.infer<EndpointResponseSchema<Config>>>

export type OptionalRequestEndpoint<
  Config extends EndpointConfig | EndpointWithDataConfig,
> = (
  request?: NaviosZodRequest<Config>,
) => Promise<z.infer<EndpointResponseSchema<Config>>>

export type BlobRequestEndpoint<Config extends BlobEndpointConfig> = (
  request: NaviosZodRequest<Config>,
) => Promise<Blob>

export type EndpointWithoutQuery<
  Config extends EndpointConfig | EndpointWithDataConfig,
> =
  UrlHasParams<Config['url']> extends true
    ? RequiredRequestEndpoint<Config>
    : Config extends EndpointWithDataConfig
      ? RequiredRequestEndpoint<Config>
      : OptionalRequestEndpoint<Config>

export type Endpoint<Config extends EndpointConfig | EndpointWithDataConfig> =
  Config['querySchema'] extends AnyZodObject
    ? RequiredRequestEndpoint<Config>
    : EndpointWithoutQuery<Config>

export type DataEndpointType<
  RequestSchema extends ZodType,
  ResponseSchema extends ZodType,
  QuerySchema = undefined,
> = QuerySchema extends AnyZodObject
  ? Omit<
      BaseEndpointConfig<
        'POST' | 'PUT' | 'PATCH',
        string,
        undefined,
        ResponseSchema,
        RequestSchema
      >,
      'querySchema'
    > & {
      querySchema: QuerySchema
    }
  : Omit<
      BaseEndpointConfig<
        'POST' | 'PUT' | 'PATCH',
        string,
        undefined,
        ResponseSchema,
        RequestSchema
      >,
      'querySchema'
    >

export type Util_FlatObject<T> = T extends object
  ? { [K in keyof T]: K extends 'urlParams' ? Util_FlatObject<T[K]> : T[K] }
  : T

export type Util_FlatType<T> =
  T extends OptionalRequestEndpoint<any>
    ? T extends (request?: infer Args) => infer R
      ? (request?: Util_FlatObject<Args>) => R
      : never
    : T extends RequiredRequestEndpoint<any>
      ? T extends (request: infer Args) => infer R
        ? (request: Util_FlatObject<Args>) => R
        : never
      : T extends (request: infer Args) => infer R
        ? (request: Util_FlatObject<Args>) => R
        : never

export type EndpointMethod<Config extends EndpointConfig> = Config['method']
export type EndpointURL<Config extends EndpointConfig> = Config['url']
export type EndpointResponseSchema<Config extends EndpointConfig> =
  Config['responseSchema']
export type EndpointQuerySchema<Config extends EndpointConfig> =
  Config['querySchema']
export type EndpointRequestSchema<Config extends EndpointWithDataConfig> =
  Config['requestSchema']
export type IsEndpointWithData<Config extends EndpointConfig> =
  Config extends EndpointWithDataConfig ? true : false
