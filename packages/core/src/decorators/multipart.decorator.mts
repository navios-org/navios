import type {
  BaseEndpointConfig,
  EndpointFunctionArgs,
  HttpMethod,
  Util_FlatObject,
} from '@navios/builder'
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
    config: BaseEndpointConfig<any, any, any, any, any>
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
 * Extracts the typed return value for a multipart endpoint handler function.
 * 
 * @typeParam EndpointDeclaration - The endpoint declaration from @navios/builder
 */
export type MultipartResult<
  EndpointDeclaration extends {
    config: BaseEndpointConfig<any, any, any, any, any>
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
export function Multipart<
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
      params: QuerySchema extends ZodObject
        ? RequestSchema extends ZodType
          ? EndpointFunctionArgs<Url, QuerySchema, RequestSchema>
          : EndpointFunctionArgs<Url, QuerySchema, undefined>
        : RequestSchema extends ZodType
          ? EndpointFunctionArgs<Url, undefined, RequestSchema>
          : EndpointFunctionArgs<Url, undefined, undefined>,
    ) => Promise<z.input<ResponseSchema>>,
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
      endpointMetadata.adapterToken = MultipartAdapterToken
      endpointMetadata.classMethod = target.name
      endpointMetadata.httpMethod = config.method
      endpointMetadata.url = config.url
    }
    return target
  }
}
