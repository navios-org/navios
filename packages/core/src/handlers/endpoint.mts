import type { BaseEndpointOptions } from '@navios/builder'

import { memberMetadata } from '../metadata/member-metadata.mjs'

import { endpointConfig } from './endpoint-declaration.mjs'

import type { EndpointDeclaration } from './endpoint-declaration.mjs'
import type { MethodHandlerFunction } from './handler-types.mjs'

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
 * The parameter type is written with `HandlerParams<typeof endpoint>`. The
 * return value is checked against the declaration; add
 * `: HandlerResult<typeof endpoint>` to have literal values (enums,
 * discriminators) checked as well.
 */
export function Endpoint<const Config extends BaseEndpointOptions>(
  endpoint: EndpointDeclaration<Config>,
) {
  return (target: MethodHandlerFunction<Config>, context: ClassMethodDecoratorContext): void => {
    if (context.kind !== 'method') {
      throw new Error('[Navios] @Endpoint can only be used on methods.')
    }
    if (typeof context.name !== 'string') {
      throw new Error('[Navios] @Endpoint cannot be used on symbol-named methods.')
    }
    const member = memberMetadata(context, context.name)
    const config = endpointConfig(endpoint)
    if (member.config !== null && member.config !== config) {
      throw new Error(
        `[Navios] ${context.name} already serves ${member.config.method} ${member.config.url}; ` +
          `a method can serve one endpoint.`,
      )
    }
    member.config = config
  }
}
