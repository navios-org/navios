import type {
  BaseEndpointConfig,
  EndpointFunctionArgs,
} from '@navios/navios-zod'
import type { HttpMethod } from 'navios'
import type { AnyZodObject, z, ZodType } from 'zod'

export const EndpointMetadataKey = Symbol('EndpointMetadataKey')

export type EndpointParams<
  EndpointDeclaration extends {
    config: BaseEndpointConfig<any, any, any, any, any>
  },
  Url extends string = EndpointDeclaration['config']['url'],
  QuerySchema = EndpointDeclaration['config']['querySchema'],
> = QuerySchema extends AnyZodObject
  ? EndpointDeclaration['config']['requestSchema'] extends ZodType
    ? EndpointFunctionArgs<
        Url,
        QuerySchema,
        EndpointDeclaration['config']['requestSchema']
      >
    : EndpointFunctionArgs<Url, QuerySchema, undefined>
  : EndpointDeclaration['config']['requestSchema'] extends ZodType
    ? EndpointFunctionArgs<
        Url,
        undefined,
        EndpointDeclaration['config']['requestSchema']
      >
    : EndpointFunctionArgs<Url, undefined, undefined>

export function Endpoint<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  QuerySchema = undefined,
  ResponseSchema extends ZodType = ZodType,
  RequestSchema = ZodType,
>(endpoint: {
  config: BaseEndpointConfig<
    Method,
    Url,
    QuerySchema,
    ResponseSchema,
    RequestSchema
  >
}) {
  return (
    target: (
      params: QuerySchema extends AnyZodObject
        ? RequestSchema extends ZodType
          ? EndpointFunctionArgs<Url, QuerySchema, RequestSchema>
          : EndpointFunctionArgs<Url, QuerySchema, undefined>
        : RequestSchema extends ZodType
          ? EndpointFunctionArgs<Url, undefined, RequestSchema>
          : EndpointFunctionArgs<Url, undefined, undefined>,
    ) => z.input<ResponseSchema>,
    context: ClassMethodDecoratorContext,
  ) => {
    if (typeof target !== 'function') {
      throw new Error(
        '[Navios] Endpoint decorator can only be used on functions.',
      )
    }
    if (context.kind !== 'method') {
      throw new Error(
        '[Navios] Endpoint decorator can only be used on methods.',
      )
    }
    const config = endpoint.config
    if (context.metadata) {
      let endpointMetadata = context.metadata[EndpointMetadataKey] as
        | Map<
            string,
            Map<
              HttpMethod,
              {
                method: string
                config: BaseEndpointConfig
              }
            >
          >
        | undefined
      if (!endpointMetadata) {
        endpointMetadata = new Map<
          string,
          Map<
            HttpMethod,
            {
              method: string
              config: BaseEndpointConfig
            }
          >
        >()
        context.metadata[EndpointMetadataKey] = endpointMetadata
      }
      const urlMetadata = endpointMetadata.get(config.url)
      if (!urlMetadata) {
        endpointMetadata.set(config.url, new Map())
      }
      let methodMetadata = endpointMetadata.get(config.url)
      if (!methodMetadata) {
        methodMetadata = new Map<
          HttpMethod,
          {
            method: string
            config: BaseEndpointConfig
          }
        >()
        endpointMetadata.set(config.url, methodMetadata)
      }
      const existingConfig = methodMetadata.get(config.method)
      if (existingConfig) {
        throw new Error(
          `[Navios] Endpoint ${config.method} ${config.url} already exists. Please use a different method or url.`,
        )
      }
      methodMetadata.set(config.method, {
        method: context.name as string,
        config: config as BaseEndpointConfig,
      })
    }
    return target
  }
}
