import type {
  EndpointHandler,
  EndpointOptions,
  RequestArgs,
} from '@navios/builder'
import type { z } from 'zod/v4'

import { Multipart as OriginalMultipart } from '../../decorators/multipart.decorator.mjs'
import { createMethodContext } from '../context-compat.mjs'

/**
 * Type helper to constrain a PropertyDescriptor's value to match a multipart endpoint signature.
 * Note: In legacy decorators, type constraints are checked when the decorator is applied,
 * but may not be preserved perfectly when decorators are stacked.
 */
type MultipartMethodDescriptor<Config extends EndpointOptions> =
  TypedPropertyDescriptor<
    (
      params: RequestArgs<
        Config['url'],
        Config['querySchema'],
        Config['requestSchema'],
        Config['urlParamsSchema'],
        true
      >,
    ) => Promise<z.input<Config['responseSchema']>>
  >

/**
 * Legacy-compatible Multipart decorator.
 *
 * Works with TypeScript experimental decorators (legacy API).
 * Provides type safety by ensuring method signatures match the endpoint configuration.
 *
 * @param endpoint - The multipart endpoint declaration from @navios/builder
 * @returns A method decorator compatible with legacy decorator API
 *
 * @example
 * ```typescript
 * @Controller()
 * export class FileController {
 *   @Multipart(uploadFileEndpoint)
 *   async uploadFile(request: MultipartParams<typeof uploadFileEndpoint>): MultipartResult<typeof uploadFileEndpoint> {
 *     const { file } = request.data
 *     return { url: 'https://example.com/file.jpg' }
 *   }
 * }
 * ```
 */
export function Multipart<const Config extends EndpointOptions>(
  endpoint: EndpointHandler<Config, false>,
) {
  return function <T extends object>(
    target: T,
    propertyKey: string | symbol,
    descriptor: MultipartMethodDescriptor<Config>,
  ): PropertyDescriptor | void {
    if (!descriptor) {
      throw new Error(
        '[Navios] @Multipart decorator requires a method descriptor. Make sure experimentalDecorators is enabled.',
      )
    }
    const context = createMethodContext(target, propertyKey, descriptor)
    const originalDecorator = OriginalMultipart(endpoint)
    // @ts-expect-error - we don't need to type the value
    const result = originalDecorator(descriptor.value, context)
    if (result !== descriptor.value) {
      descriptor.value = result as any
    }
    return descriptor
  }
}
