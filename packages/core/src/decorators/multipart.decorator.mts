import type { EndpointOptions, RequestArgs } from '@navios/builder'
import type { z, ZodObject, ZodType } from 'zod/v4'

import { ZodDiscriminatedUnion } from 'zod/v4'

import { getEndpointMetadata } from '../metadata/index.mjs'
import { MultipartAdapterToken } from '../tokens/index.mjs'

/**
 * Extracts the typed parameters for a multipart endpoint handler function.
 *
 * Similar to `EndpointParams`, but specifically for multipart/form-data endpoints.
 *
 * @typeParam EndpointDeclaration - The endpoint declaration from @navios/builder
 */
export type MultipartParams<
  EndpointDeclaration extends {
    config: EndpointOptions
  },
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
    : RequestArgs<
        Url,
        undefined,
        undefined,
        EndpointDeclaration['config']['urlParamsSchema'],
        true
      >

/**
 * Extracts the typed return value for a multipart endpoint handler function.
 *
 * @typeParam EndpointDeclaration - The endpoint declaration from @navios/builder
 */
export type MultipartResult<
  EndpointDeclaration extends {
    config: EndpointOptions
  },
> =
  EndpointDeclaration['config']['responseSchema'] extends ZodDiscriminatedUnion<
    infer Options
  >
    ? Promise<z.input<Options[number]>>
    : Promise<z.input<EndpointDeclaration['config']['responseSchema']>>

/**
 * Decorator that marks a method as a multipart/form-data endpoint.
 *
 * Use this decorator for endpoints that handle file uploads or form data.
 * The endpoint must be defined using @navios/builder's `declareMultipart` method.
 *
 * @param endpoint - The multipart endpoint declaration from @navios/builder
 * @returns A method decorator
 *
 * @example
 * ```typescript
 * const uploadFileEndpoint = api.declareMultipart({
 *   method: 'post',
 *   url: '/upload',
 *   requestSchema: z.object({ file: z.instanceof(File) }),
 *   responseSchema: z.object({ url: z.string() }),
 * })
 *
 * @Controller()
 * export class FileController {
 *   @Multipart(uploadFileEndpoint)
 *   async uploadFile(request: MultipartParams<typeof uploadFileEndpoint>) {
 *     const { file } = request.data
 *     // Handle file upload
 *     return { url: 'https://example.com/file.jpg' }
 *   }
 * }
 * ```
 */
export function Multipart<Config extends EndpointOptions>(endpoint: {
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
  ) =>
    | Promise<z.input<Config['responseSchema']>>
    | z.input<Config['responseSchema']>,
  context: ClassMethodDecoratorContext,
) => void
export function Multipart<Config extends EndpointOptions>(endpoint: {
  config: Config
}): (
  target: () =>
    | Promise<z.input<Config['responseSchema']>>
    | z.input<Config['responseSchema']>,
  context: ClassMethodDecoratorContext,
) => void
export function Multipart<Config extends EndpointOptions>(endpoint: {
  config: Config
}) {
  type Params = RequestArgs<
    Config['url'],
    Config['querySchema'],
    Config['requestSchema'],
    Config['urlParamsSchema'],
    true
  >

  type Handler =
    | ((
        params: Params,
      ) =>
        | Promise<z.input<Config['responseSchema']>>
        | z.input<Config['responseSchema']>)
    | (() =>
        | Promise<z.input<Config['responseSchema']>>
        | z.input<Config['responseSchema']>)

  return (target: Handler, context: ClassMethodDecoratorContext) => {
    if (context.kind !== 'method') {
      throw new Error(
        '[Navios] Endpoint decorator can only be used on methods.',
      )
    }
    const config = endpoint.config
    if (context.metadata) {
      let endpointMetadata = getEndpointMetadata<EndpointOptions>(
        target,
        context,
      )
      if (endpointMetadata.config && endpointMetadata.config.url) {
        throw new Error(
          `[Navios] Endpoint ${config.method} ${config.url} already exists. Please use a different method or url.`,
        )
      }
      endpointMetadata.config = config
      endpointMetadata.adapterToken = MultipartAdapterToken
      endpointMetadata.classMethod = target.name
      endpointMetadata.httpMethod = config.method
      endpointMetadata.url = config.url
    }
    return target
  }
}
