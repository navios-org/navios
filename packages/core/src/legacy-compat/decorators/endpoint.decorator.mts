import { createMethodContext } from '@navios/di/legacy-compat'

import type { EndpointHandler, ServerRequestArgs } from '@navios/builder'

import { Endpoint as OriginalEndpoint } from '../../decorators/endpoint.decorator.mjs'

import type { EndpointDecoratorConfig } from '../../decorators/endpoint-declaration.mjs'
import type { EndpointHandlerReturn } from '../../decorators/endpoint.decorator.mjs'

/**
 * Type helper to constrain a PropertyDescriptor's value to match an endpoint signature.
 * Note: In legacy decorators, type constraints are checked when the decorator is applied,
 * but may not be preserved perfectly when decorators are stacked.
 */
/**
 * What a method under `@Endpoint` must be assignable to.
 *
 * The decorator is generic over the method's own type and only constrains it
 * with this signature. A `TypedPropertyDescriptor` of one fixed function type
 * would be invariant (its `set` takes the type, its `get` returns it), which
 * would reject a method whose return type is narrower than the endpoint's —
 * one that only throws, or returns some of the declared replies.
 */
type EndpointMethod<Config extends EndpointDecoratorConfig> = (
  params: ServerRequestArgs<Config>,
) => Promise<EndpointHandlerReturn<Config>> | EndpointHandlerReturn<Config>

/**
 * Legacy-compatible Endpoint decorator.
 *
 * Works with TypeScript experimental decorators (legacy API).
 * Provides type safety by ensuring method signatures match the endpoint configuration.
 *
 * The declaration's `body` must be absent or `'json'` and its `response` absent,
 * `'json'` or `'void'`; anything else does not compile and throws when the
 * decorator is applied. A `response: 'void'` endpoint returns nothing and is
 * answered with 204 No Content (unless `@HttpCode` sets another status).
 *
 * A declaration with a per-status `responses` map is served too: the method
 * returns `reply(status, body)` for one of the declared statuses. `@HttpCode`
 * cannot be combined with it and throws when the decorators are applied.
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
export function Endpoint<const Config extends EndpointDecoratorConfig>(
  endpoint: EndpointHandler<Config>,
) {
  return function <Method extends EndpointMethod<Config>>(
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<Method>,
  ): TypedPropertyDescriptor<Method> | void {
    if (!descriptor) {
      throw new Error(
        '[Navios] @Endpoint decorator requires a method descriptor. Make sure experimentalDecorators is enabled.',
      )
    }
    // Type check the descriptor value matches expected signature
    const typedDescriptor = descriptor
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
