import { createMethodContext } from '@navios/di/legacy-compat'

import type { EndpointHandler, EndpointOptions, RequestArgs } from '@navios/builder'
import type { z } from 'zod/v4'

import { Endpoint as OriginalEndpoint } from '../../decorators/endpoint.decorator.mjs'

/**
 * Type helper to constrain a PropertyDescriptor's value to match an endpoint signature.
 * Note: In legacy decorators, type constraints are checked when the decorator is applied,
 * but may not be preserved perfectly when decorators are stacked.
 */
type EndpointMethodDescriptor<Config extends EndpointOptions> = TypedPropertyDescriptor<
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
 * Legacy-compatible Endpoint decorator.
 *
 * Works with TypeScript experimental decorators (legacy API).
 * Provides type safety by ensuring method signatures match the endpoint configuration.
 *
 * @param endpoint - The endpoint declaration from @navios/builder
 * @returns A method decorator compatible with legacy decorator API
 *
 * @example
 * ```typescript
 * @Controller()
 * export class UserController {
 *   @Endpoint(getUserEndpoint)
 *   async getUser(request: EndpointParams<typeof getUserEndpoint>): EndpointResult<typeof getUserEndpoint> {
 *     return { id: '1', name: 'John' }
 *   }
 * }
 * ```
 */
export function Endpoint<const Config extends EndpointOptions>(
  endpoint: EndpointHandler<Config, false>,
) {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: EndpointMethodDescriptor<Config>,
  ): PropertyDescriptor | void {
    if (!descriptor) {
      throw new Error(
        '[Navios] @Endpoint decorator requires a method descriptor. Make sure experimentalDecorators is enabled.',
      )
    }
    // Type check the descriptor value matches expected signature
    const typedDescriptor = descriptor as EndpointMethodDescriptor<Config>
    const context = createMethodContext(target, propertyKey, typedDescriptor)
    const originalDecorator = OriginalEndpoint(endpoint)
    // @ts-expect-error - we don't need to type the value
    const result = originalDecorator(typedDescriptor.value, context)
    if (result !== typedDescriptor.value) {
      typedDescriptor.value = result as any
    }
    return typedDescriptor
  }
}
