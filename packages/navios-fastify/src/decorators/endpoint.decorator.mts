import type {
  BaseEndpointConfig,
  EndpointFunctionArgs,
} from '@navios/navios-zod'
import type { HttpMethod } from 'navios'
import type { AnyZodObject, z, ZodType } from 'zod'

import type { ClassTypeWithInstance } from '../service-locator/index.mjs'

export const EndpointMetadataKey = Symbol('EndpointMetadataKey')

export type EndpointMetadata = Map<
  string,
  Map<
    HttpMethod,
    {
      method: string
      config: BaseEndpointConfig
      middleware?: ClassTypeWithInstance<any>[]
    }
  >
>

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
        | EndpointMetadata
        | undefined
      if (!endpointMetadata) {
        endpointMetadata = new Map()
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

export function getEndpointMetadata(target: () => any): EndpointMetadata {
  // @ts-expect-error We add a custom metadata key to the target
  const metadata = target[EndpointMetadataKey] as EndpointMetadata | undefined
  if (!metadata) {
    throw new Error(
      '[Navios] No endpoint metadata found. Please make sure to use the @Endpoint decorator.',
    )
  }
  return metadata
}
