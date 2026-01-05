import type { ClassType, FactoryOptions } from '@navios/di'

import { Factory as OriginalFactory } from '@navios/di'

import { createClassContext } from '../context-compat.mjs'

export type { FactoryOptions }

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
  return function (target: ClassType) {
    const context = createClassContext(target)
    // Use the no-args overload when options is empty, otherwise pass options
    const originalDecorator =
      Object.keys(options).length === 0
        ? OriginalFactory()
        : OriginalFactory(options)
    return originalDecorator(target, context)
  }
}
