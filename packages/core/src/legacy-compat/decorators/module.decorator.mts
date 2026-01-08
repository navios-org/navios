import type { ClassType } from '@navios/di'
import { createClassContext } from '@navios/di/legacy-compat'

import { Module as OriginalModule, type ModuleOptions } from '../../decorators/module.decorator.mjs'

/**
 * Legacy-compatible Module decorator.
 * 
 * Works with TypeScript experimental decorators (legacy API).
 * 
 * @param options - Module configuration options
 * @returns A class decorator compatible with legacy decorator API
 * 
 * @example
 * ```typescript
 * @Module({
 *   controllers: [UserController, AuthController],
 *   imports: [DatabaseModule],
 *   guards: [AuthGuard],
 * })
 * export class AppModule {}
 * ```
 */
export function Module(
  options: ModuleOptions = {
    controllers: [],
    imports: [],
    guards: [],
  },
) {
  return function (target: ClassType) {
    const context = createClassContext(target)
    const originalDecorator = OriginalModule(options)
    return originalDecorator(target, context)
  }
}

