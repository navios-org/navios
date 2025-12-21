import type { ClassType } from '@navios/di'

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
export function Controller({ guards, registry }: ControllerOptions = {}) {
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
    })(target, context)
  }
}
