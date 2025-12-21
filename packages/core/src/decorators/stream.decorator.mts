import type {
  BaseStreamConfig,
  EndpointFunctionArgs,
  HttpMethod,
  Util_FlatObject,
} from '@navios/builder'
import type { ZodObject, ZodType } from 'zod/v4'

import { getEndpointMetadata } from '../metadata/index.mjs'
import { StreamAdapterToken } from '../tokens/index.mjs'

/**
 * Extracts the typed parameters for a stream endpoint handler function.
 *
 * Similar to `EndpointParams`, but specifically for streaming endpoints.
 *
 * @typeParam EndpointDeclaration - The stream endpoint declaration from @navios/builder
 */
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

/**
 * Decorator that marks a method as a streaming endpoint.
 *
 * Use this decorator for endpoints that stream data (e.g., file downloads, SSE).
 * The endpoint must be defined using @navios/builder's `declareStream` method.
 *
 * @param endpoint - The stream endpoint declaration from @navios/builder
 * @returns A method decorator
 *
 * @example
 * ```typescript
 * const downloadFileEndpoint = api.declareStream({
 *   method: 'get',
 *   url: '/files/$fileId',
 * })
 *
 * @Controller()
 * export class FileController {
 *   @Stream(downloadFileEndpoint)
 *   async downloadFile(request: StreamParams<typeof downloadFileEndpoint>, reply: any) {
 *     const { fileId } = request.urlParams
 *     // Stream file data to reply
 *   }
 * }
 * ```
 */
export function Stream<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  QuerySchema = undefined,
  RequestSchema = ZodType,
  Params = QuerySchema extends ZodObject
    ? RequestSchema extends ZodType
      ? EndpointFunctionArgs<Url, QuerySchema, RequestSchema, true>
      : EndpointFunctionArgs<Url, QuerySchema, undefined, true>
    : RequestSchema extends ZodType
      ? EndpointFunctionArgs<Url, undefined, RequestSchema, true>
      : EndpointFunctionArgs<Url, undefined, undefined, true>,
>(endpoint: {
  config: BaseStreamConfig<Method, Url, QuerySchema, RequestSchema>
}): (
  target: (params: Params, reply: any) => any,
  context: ClassMethodDecoratorContext,
) => void
// Bun doesn't support reply parameter
export function Stream<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  QuerySchema = undefined,
  RequestSchema = ZodType,
  Params = QuerySchema extends ZodObject
    ? RequestSchema extends ZodType
      ? EndpointFunctionArgs<Url, QuerySchema, RequestSchema, true>
      : EndpointFunctionArgs<Url, QuerySchema, undefined, true>
    : RequestSchema extends ZodType
      ? EndpointFunctionArgs<Url, undefined, RequestSchema, true>
      : EndpointFunctionArgs<Url, undefined, undefined, true>,
>(endpoint: {
  config: BaseStreamConfig<Method, Url, QuerySchema, RequestSchema>
}): (
  target: (params: Params) => any,
  context: ClassMethodDecoratorContext,
) => void
export function Stream<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  QuerySchema = undefined,
  RequestSchema = ZodType,
>(endpoint: {
  config: BaseStreamConfig<Method, Url, QuerySchema, RequestSchema>
}): (target: () => any, context: ClassMethodDecoratorContext) => void
export function Stream<
  Method extends HttpMethod = HttpMethod,
  Url extends string = string,
  QuerySchema = undefined,
  RequestSchema = ZodType,
>(endpoint: {
  config: BaseStreamConfig<Method, Url, QuerySchema, RequestSchema>
}) {
  type Params = QuerySchema extends ZodObject
    ? RequestSchema extends ZodType
      ? EndpointFunctionArgs<Url, QuerySchema, RequestSchema, true>
      : EndpointFunctionArgs<Url, QuerySchema, undefined, true>
    : RequestSchema extends ZodType
      ? EndpointFunctionArgs<Url, undefined, RequestSchema, true>
      : EndpointFunctionArgs<Url, undefined, undefined, true>

  type Handler =
    | ((params: Params, reply: any) => any)
    | ((params: Params) => any)
    | (() => any)

  return (target: Handler, context: ClassMethodDecoratorContext) => {
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
