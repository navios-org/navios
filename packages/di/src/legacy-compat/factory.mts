import { registerFactory } from '../provider/registration.mjs'

import type { FactoryOptions } from '../decorators/factory.mjs'
import type { ClassType } from '../token/class-type.mjs'

import { assertLegacyClass } from './context-compat.mjs'

/**
 * Legacy-compatible Factory decorator.
 *
 * Works with TypeScript experimental decorators (legacy API).
 *
 * @param options - Factory configuration options
 * @returns A class decorator compatible with legacy decorator API
 *
 * @example
 * ```typescript
 * @Factory()
 * export class DatabaseConnectionFactory {
 *   create() {
 *     return { host: 'localhost', port: 5432 }
 *   }
 * }
 * ```
 */
export function Factory(options: FactoryOptions = {}) {
  return <T extends ClassType>(target: T): T => {
    assertLegacyClass('Factory', target)
    registerFactory(target, options)
    return target
  }
}
