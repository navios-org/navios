import { createMethodContext } from '@navios/di/legacy-compat'

import type { EndpointHandler, ServerRequestArgs } from '@navios/builder'

import { Multipart as OriginalMultipart } from '../../decorators/multipart.decorator.mjs'

import type { MultipartDecoratorConfig } from '../../decorators/endpoint-declaration.mjs'
import type { EndpointHandlerReturn } from '../../decorators/endpoint.decorator.mjs'

/**
 * Type helper to constrain a PropertyDescriptor's value to match a multipart endpoint signature.
 * Note: In legacy decorators, type constraints are checked when the decorator is applied,
 * but may not be preserved perfectly when decorators are stacked.
 */
/**
 * What a method under `@Multipart` must be assignable to. The decorator is
 * generic over the method's own type, so a narrower return type (a method
 * that only throws, or returns some of the declared replies) is accepted.
 */
type MultipartMethod<Config extends MultipartDecoratorConfig> = (
  params: ServerRequestArgs<Config>,
) => Promise<EndpointHandlerReturn<Config>> | EndpointHandlerReturn<Config>

/**
 * Legacy-compatible Multipart decorator.
 *
 * Works with TypeScript experimental decorators (legacy API).
 * Provides type safety by ensuring method signatures match the endpoint configuration.
 *
 * The endpoint must be declared with `body: 'multipart'`. Its response side
 * takes what `@Endpoint` takes: a `responseSchema` (`response` absent or
 * `'json'`), `response: 'void'`, or a per-status `responses` map. Anything
 * else (`response: 'blob' | 'text' | 'stream'`, another `body`) does not
 * compile and throws when the decorator is applied.
 *
 * A `response: 'void'` endpoint returns nothing and is answered with
 * 204 No Content (unless `@HttpCode` sets another status). With a `responses`
 * map the method returns `reply(status, body)` for one of the declared
 * statuses; `@HttpCode` cannot be combined with it and throws when the
 * decorators are applied.
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
export function Multipart<const Config extends MultipartDecoratorConfig>(
  endpoint: EndpointHandler<Config>,
) {
  return function <T extends object, Method extends MultipartMethod<Config>>(
    target: T,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<Method>,
  ): TypedPropertyDescriptor<Method> | void {
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
