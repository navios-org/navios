import type {
  BaseEndpointOptions,
  RequestArgs,
  StreamHandler,
} from '@navios/builder'
import { createMethodContext } from '@navios/di/legacy-compat'

import { Stream as OriginalStream } from '../../decorators/stream.decorator.mjs'

/**
 * Type helper to constrain a PropertyDescriptor's value to match a stream endpoint signature.
 * Supports both with and without reply parameter (Bun doesn't use reply parameter).
 * Note: In legacy decorators, type constraints are checked when the decorator is applied,
 * but may not be preserved perfectly when decorators are stacked.
 */
type StreamMethodDescriptor<Config extends BaseEndpointOptions> =
  | TypedPropertyDescriptor<
      (
        params: RequestArgs<
          Config['url'],
          Config['querySchema'],
          Config['requestSchema'],
          Config['urlParamsSchema'],
          true
        >,
        reply: any,
      ) => any
    >
  | TypedPropertyDescriptor<
      (
        params: RequestArgs<
          Config['url'],
          Config['querySchema'],
          Config['requestSchema'],
          Config['urlParamsSchema'],
          true
        >,
      ) => any
    >

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
export function Stream<const Config extends BaseEndpointOptions>(
  endpoint: StreamHandler<Config, false>,
) {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: StreamMethodDescriptor<Config>,
  ): PropertyDescriptor | void {
    if (!descriptor || !descriptor.value) {
      throw new Error(
        '[Navios] @Stream decorator requires a method descriptor. Make sure experimentalDecorators is enabled.',
      )
    }
    // Type check the descriptor value matches expected signature
    const typedDescriptor = descriptor as StreamMethodDescriptor<Config>
    const context = createMethodContext(target, propertyKey, typedDescriptor)
    const originalDecorator = OriginalStream(endpoint)
    // Stage3 decorator returns void in type signature but actually returns the function
    // We know value is defined because we checked above
    const result = originalDecorator(typedDescriptor.value!, context) as
      | typeof typedDescriptor.value
      | void
    if (result && result !== typedDescriptor.value) {
      typedDescriptor.value = result as any
    }
    return typedDescriptor
  }
}
