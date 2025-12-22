import type { ClassType, InjectableScope } from '@navios/di'

import { Injectable, InjectionToken, Registry } from '@navios/di'

import { getControllerMetadata } from '../metadata/index.mjs'

/**
 * Options for configuring a Navios controller.
 */
export interface ControllerOptions {
  /**
   * Guards to apply to all endpoints in this controller.
   * Guards are executed in reverse order (last guard first).
   */
  guards?: ClassType[] | Set<ClassType>
  /**
   * Registry to use for the controller.
   * Registry is used to store the controller and its endpoints.
   */
  registry?: Registry
  /**
   * Priority to use for the controller.
   * Priority is used to sort the controller in the registry.
   */
  priority?: number
  /**
   * Scope to use for the controller.
   * Scope is used to determine the scope of the controller.
   */
  scope?: InjectableScope
}

/**
 * Decorator that marks a class as a Navios controller.
 *
 * Controllers handle HTTP requests and define endpoints.
 * They are request-scoped by default, meaning a new instance is created for each request.
 *
 * @param options - Controller configuration options
 * @returns A class decorator
 *
 * @example
 * ```typescript
 * @Controller({ guards: [AuthGuard] })
 * export class UserController {
 *   @Endpoint(getUserEndpoint)
 *   async getUser(request: EndpointParams<typeof getUserEndpoint>) {
 *     // Handle request
 *   }
 * }
 * ```
 */
export function Controller({
  guards,
  registry,
  priority,
  scope,
}: ControllerOptions = {}) {
  return function (target: ClassType, context: ClassDecoratorContext) {
    if (context.kind !== 'class') {
      throw new Error(
        '[Navios] @Controller decorator can only be used on classes.',
      )
    }
    const token = InjectionToken.create(target)
    if (context.metadata) {
      const controllerMetadata = getControllerMetadata(target, context)
      if (guards) {
        for (const guard of Array.from(guards).reverse()) {
          controllerMetadata.guards.add(guard)
        }
      }
    }
    return Injectable({
      token,
      registry,
      priority,
      scope,
    })(target, context)
  }
}
