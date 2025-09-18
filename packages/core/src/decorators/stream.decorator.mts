import type {
  BaseStreamConfig,
  EndpointFunctionArgs,
  HttpMethod,
  Util_FlatObject,
} from '@navios/builder'
import type { FastifyReply } from 'fastify'
import type { ZodObject, ZodType } from 'zod/v4'

import { getEndpointMetadata } from '../metadata/index.mjs'
import { StreamAdapterToken } from '../tokens/index.mjs'

export type StreamParams<
  EndpointDeclaration extends {
    config: BaseStreamConfig<any, any, any, any>
  },
  Url extends string = EndpointDeclaration['config']['url'],
  QuerySchema = EndpointDeclaration['config']['querySchema'],
> = QuerySchema extends ZodObject
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

export function Stream<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  QuerySchema = undefined,
  RequestSchema = ZodType,
>(endpoint: {
  config: BaseStreamConfig<Method, Url, QuerySchema, RequestSchema>
}) {
  return (
    target: (
      params: QuerySchema extends ZodObject
        ? RequestSchema extends ZodType
          ? EndpointFunctionArgs<Url, QuerySchema, RequestSchema>
          : EndpointFunctionArgs<Url, QuerySchema, undefined>
        : RequestSchema extends ZodType
          ? EndpointFunctionArgs<Url, undefined, RequestSchema>
          : EndpointFunctionArgs<Url, undefined, undefined>,
      reply: FastifyReply,
    ) => Promise<void>,
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
      let endpointMetadata = getEndpointMetadata<BaseStreamConfig>(
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
      endpointMetadata.adapterToken = StreamAdapterToken
      endpointMetadata.classMethod = target.name
      endpointMetadata.httpMethod = config.method
      endpointMetadata.url = config.url
    }
    return target
  }
}
