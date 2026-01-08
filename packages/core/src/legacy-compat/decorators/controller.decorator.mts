import type { ClassType } from '@navios/di'
import { createClassContext } from '@navios/di/legacy-compat'

import type { ControllerOptions } from '../../decorators/controller.decorator.mjs'

import { Controller as OriginalController } from '../../decorators/controller.decorator.mjs'

/**
 * Legacy-compatible Controller decorator.
 *
 * Works with TypeScript experimental decorators (legacy API).
 *
 * @param options - Controller configuration options
 * @returns A class decorator compatible with legacy decorator API
 *
 * @example
 * ```typescript
 * @Controller({ guards: [AuthGuard] })
 * export class UserController {
 *   @Endpoint(getUserEndpoint)
 *   async getUser() { }
 * }
 * ```
 */
export function Controller(options: ControllerOptions = {}) {
  return function (target: ClassType) {
    const context = createClassContext(target)
    const originalDecorator = OriginalController(options)
    return originalDecorator(target, context)
  }
}
