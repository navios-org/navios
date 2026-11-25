import { memberMetadata } from '@navios/core/transport'

import type { BaseEndpointOptions } from '@navios/builder'
import type { MethodHandlerMetadata } from '@navios/core/transport'

import { assertStandardDecorator } from '../internal/standard-decorator.mjs'

import type { RouteEndpointConfig } from '../routing/endpoint-config.mjs'

import { endpointConfig, EndpointEntryKey } from './endpoint-declaration.mjs'

import type { EndpointDeclaration } from './endpoint-declaration.mjs'
import type { MethodHandlerFunction } from './handler-types.mjs'

/**
 * The members that a class declares itself. A member it inherits starts as a
 * copy of the one it overrides, with the endpoint of that.
 */
const declared = new WeakMap<MethodHandlerMetadata, RouteEndpointConfig>()

/**
 * Serves a builder endpoint with a controller method. The body kind, response
 * kind and status codes all come from the declaration.
 *
 * ```ts
 * @Controller()
 * export class UsersController {
 *   private readonly users = inject(UsersService)
 *
 *   @Endpoint(getUser)
 *   async getUser({ urlParams }: HandlerParams<typeof getUser>, ctx: RequestContext) {
 *     const user = await this.users.findById(urlParams.id)
 *     return user ?? reply(404, { message: 'User not found' })
 *   }
 * }
 * ```
 *
 * A method that overrides one of a base class serves the endpoint it is
 * decorated with, under the guards, interceptors and attributes of both.
 *
 * The parameter type is written with `HandlerParams<typeof endpoint>`. The
 * return value is checked against the declaration; add
 * `: HandlerResult<typeof endpoint>` to have literal values (enums,
 * discriminators) checked as well.
 */
export function Endpoint<const Config extends BaseEndpointOptions>(
  endpoint: EndpointDeclaration<Config>,
) {
  return (target: MethodHandlerFunction<Config>, context: ClassMethodDecoratorContext): void => {
    assertStandardDecorator('Endpoint', context)
    if (context.kind !== 'method') {
      throw new Error('[Navios] @Endpoint can only be used on methods.')
    }
    if (typeof context.name !== 'string') {
      throw new Error('[Navios] @Endpoint cannot be used on symbol-named methods.')
    }
    const member = memberMetadata(context, context.name)
    const config = endpointConfig(endpoint)
    const existing = declared.get(member)
    if (existing !== undefined && existing !== config) {
      throw new Error(
        `[Navios] ${context.name} already serves ${existing.method} ${existing.url}; ` +
          `a method can serve one endpoint.`,
      )
    }
    declared.set(member, config)
    member.entries.set(EndpointEntryKey, config)
  }
}
