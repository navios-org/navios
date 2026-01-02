import type {
  BaseStreamConfig,
  EndpointFunctionArgs,
  HttpMethod,
} from '@navios/builder'
import type { ZodObject, ZodType } from 'zod/v4'

import { Stream as OriginalStream } from '../../decorators/stream.decorator.mjs'
import { createMethodContext } from '../context-compat.mjs'

type StreamParams<
  Url extends string,
  QuerySchema,
  RequestSchema,
> = QuerySchema extends ZodObject
  ? RequestSchema extends ZodType
    ? EndpointFunctionArgs<Url, QuerySchema, RequestSchema, true>
    : EndpointFunctionArgs<Url, QuerySchema, undefined, true>
  : RequestSchema extends ZodType
    ? EndpointFunctionArgs<Url, undefined, RequestSchema, true>
    : EndpointFunctionArgs<Url, undefined, undefined, true>

/**
 * Type helper to constrain a PropertyDescriptor's value to match a stream endpoint signature.
 * Supports both with and without reply parameter (Bun doesn't use reply parameter).
 */
type StreamMethodDescriptor<
  Url extends string,
  QuerySchema,
  RequestSchema,
> =
  | TypedPropertyDescriptor<
      (params: StreamParams<Url, QuerySchema, RequestSchema>, reply: any) => any
    >
  | TypedPropertyDescriptor<
      (params: StreamParams<Url, QuerySchema, RequestSchema>) => any
    >
  | TypedPropertyDescriptor<() => any>

/**
 * Legacy-compatible Stream decorator.
 *
 * Works with TypeScript experimental decorators (legacy API).
 * Provides type safety by ensuring method signatures match the endpoint configuration.
 *
 * @param endpoint - The stream endpoint declaration from @navios/builder
 * @returns A method decorator compatible with legacy decorator API
 *
 * @example
 * ```typescript
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
>(endpoint: {
  config: BaseStreamConfig<Method, Url, QuerySchema, RequestSchema>
}) {
  return function <T extends object>(
    target: T,
    propertyKey: string | symbol,
    descriptor: StreamMethodDescriptor<Url, QuerySchema, RequestSchema>,
  ) {
    const context = createMethodContext(target, propertyKey, descriptor)
    const originalDecorator = OriginalStream(endpoint)
    // @ts-expect-error - we don't need to type the value
    const result = originalDecorator(descriptor.value, context)
    if (result !== descriptor.value) {
      descriptor.value = result as any
    }
    return descriptor
  }
}
