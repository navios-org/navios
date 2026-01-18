import type { BaseEndpointOptions, RequestArgs, StreamHandler } from '@navios/builder'
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
  EndpointDeclaration extends StreamHandler<Config, false>,
  Config extends BaseEndpointOptions = EndpointDeclaration['config'],
  Url extends string = EndpointDeclaration['config']['url'],
  QuerySchema = EndpointDeclaration['config']['querySchema'],
> = QuerySchema extends ZodObject
  ? EndpointDeclaration['config']['requestSchema'] extends ZodType
    ? RequestArgs<
        Url,
        QuerySchema,
        EndpointDeclaration['config']['requestSchema'],
        EndpointDeclaration['config']['urlParamsSchema'],
        true
      >
    : RequestArgs<
        Url,
        QuerySchema,
        undefined,
        EndpointDeclaration['config']['urlParamsSchema'],
        true
      >
  : EndpointDeclaration['config']['requestSchema'] extends ZodType
    ? RequestArgs<
        Url,
        undefined,
        EndpointDeclaration['config']['requestSchema'],
        EndpointDeclaration['config']['urlParamsSchema'],
        true
      >
    : RequestArgs<Url, undefined, undefined, EndpointDeclaration['config']['urlParamsSchema'], true>

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
export function Stream<Config extends BaseEndpointOptions>(endpoint: {
  config: Config
}): (
  target: (
    params: RequestArgs<
      Config['url'],
      Config['querySchema'],
      Config['requestSchema'],
      Config['urlParamsSchema'],
      true
    >,
    reply: any,
  ) => any,
  context: ClassMethodDecoratorContext,
) => void
// Bun doesn't support reply parameter
export function Stream<Config extends BaseEndpointOptions>(endpoint: {
  config: Config
}): (
  target: (
    params: RequestArgs<
      Config['url'],
      Config['querySchema'],
      Config['requestSchema'],
      Config['urlParamsSchema'],
      true
    >,
  ) => any,
  context: ClassMethodDecoratorContext,
) => void
export function Stream<Config extends BaseEndpointOptions>(endpoint: {
  config: Config
}): (target: () => any, context: ClassMethodDecoratorContext) => void
export function Stream<Config extends BaseEndpointOptions>(endpoint: { config: Config }) {
  type Params = RequestArgs<
    Config['url'],
    Config['querySchema'],
    Config['requestSchema'],
    Config['urlParamsSchema'],
    true
  >

  type Handler = ((params: Params, reply: any) => any) | ((params: Params) => any) | (() => any)

  return (target: Handler, context: ClassMethodDecoratorContext) => {
    if (context.kind !== 'method') {
      throw new Error('[Navios] Endpoint decorator can only be used on methods.')
    }
    const config = endpoint.config
    if (context.metadata) {
      let endpointMetadata = getEndpointMetadata<BaseEndpointOptions>(target, context)
      if (endpointMetadata.config && endpointMetadata.config.url) {
        throw new Error(
          `[Navios] Endpoint ${config.method} ${config.url} already exists. Please use a different method or url.`,
        )
      }
      endpointMetadata.config = config
      endpointMetadata.adapterToken = StreamAdapterToken
      endpointMetadata.classMethod = target.name
      endpointMetadata.httpMethod = config.method
      endpointMetadata.url = config.url
    }
    return target
  }
}
