import type {
  BaseEndpointConfig,
  EndpointFunctionArgs,
  HttpMethod,
  Util_FlatObject,
} from '@navios/builder'
import type { AnyZodObject, z, ZodType } from 'zod'

import { ZodDiscriminatedUnion } from 'zod'

import { EndpointAdapterToken } from '../adapters/index.mjs'
import { getEndpointMetadata } from '../metadata/index.mjs'

export type EndpointParams<
  EndpointDeclaration extends {
    config: BaseEndpointConfig<any, any, any, any, any>
  },
  Url extends string = EndpointDeclaration['config']['url'],
  QuerySchema = EndpointDeclaration['config']['querySchema'],
> = QuerySchema extends AnyZodObject
  ? EndpointDeclaration['config']['requestSchema'] extends ZodType
    ? Util_FlatObject<
        EndpointFunctionArgs<
          Url,
          QuerySchema,
          EndpointDeclaration['config']['requestSchema'],
          true
        >
      >
    : Util_FlatObject<EndpointFunctionArgs<Url, QuerySchema, undefined, true>>
  : EndpointDeclaration['config']['requestSchema'] extends ZodType
    ? Util_FlatObject<
        EndpointFunctionArgs<
          Url,
          undefined,
          EndpointDeclaration['config']['requestSchema'],
          true
        >
      >
    : Util_FlatObject<EndpointFunctionArgs<Url, undefined, undefined, true>>

export type EndpointResult<
  EndpointDeclaration extends {
    config: BaseEndpointConfig<any, any, any, any, any>
  },
> =
  EndpointDeclaration['config']['responseSchema'] extends ZodDiscriminatedUnion<
    any,
    infer Options
  >
    ? Promise<z.input<Options[number]>>
    : Promise<z.input<EndpointDeclaration['config']['responseSchema']>>

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
    ) => Promise<z.input<ResponseSchema>>,
    context: ClassMethodDecoratorContext,
  ) => {
    if (context.kind !== 'method') {
      throw new Error(
        '[Navios] Endpoint decorator can only be used on methods.',
      )
    }
    const config = endpoint.config
    if (context.metadata) {
      let endpointMetadata = getEndpointMetadata<BaseEndpointConfig>(
        target,
        context,
      )
      if (endpointMetadata.config && endpointMetadata.config.url) {
        throw new Error(
          `[Navios] Endpoint ${config.method} ${config.url} already exists. Please use a different method or url.`,
        )
      }
      // @ts-expect-error We don't need to set correctly in the metadata
      endpointMetadata.config = config
      endpointMetadata.adapterToken = EndpointAdapterToken
      endpointMetadata.classMethod = target.name
      endpointMetadata.httpMethod = config.method
      endpointMetadata.url = config.url
    }
    return target
  }
}
