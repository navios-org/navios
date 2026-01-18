import type { ClassType, ClassTypeWithInstance, InjectionToken } from '@navios/di'

import { getControllerMetadata, getEndpointMetadata } from '../metadata/index.mjs'

import type { CanActivate } from '../interfaces/index.mjs'

/**
 * Decorator that applies guards to a controller or endpoint.
 *
 * Guards are used for authentication, authorization, and request validation.
 * They implement the `CanActivate` interface and are executed before the endpoint handler.
 * Guards can be applied at the module, controller, or endpoint level.
 *
 * @param guards - Guard classes or injection tokens to apply
 * @returns A class or method decorator
 *
 * @example
 * ```typescript
 * // Apply to a controller
 * @Controller()
 * @UseGuards(AuthGuard, RoleGuard)
 * export class UserController {
 *   @Endpoint(getUserEndpoint)
 *   async getUser() { }
 * }
 *
 * // Apply to a specific endpoint
 * @Controller()
 * export class UserController {
 *   @Endpoint(getUserEndpoint)
 *   @UseGuards(AuthGuard)
 *   async getUser() { }
 * }
 * ```
 */
export function UseGuards(
  ...guards: (ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>)[]
) {
  return function <T extends Function>(
    target: T,
    context: ClassMethodDecoratorContext | ClassDecoratorContext,
  ): T {
    if (context.kind === 'class') {
      const controllerMetadata = getControllerMetadata(target as unknown as ClassType, context)
      for (const guard of guards.reverse()) {
        controllerMetadata.guards.add(guard)
      }
    } else if (context.kind === 'method') {
      const endpointMetadata = getEndpointMetadata(target, context)
      for (const guard of guards.reverse()) {
        endpointMetadata.guards.add(guard)
      }
    } else {
      throw new Error('[Navios] @UseGuards decorator can only be used on classes or methods.')
    }
    return target
  }
}
