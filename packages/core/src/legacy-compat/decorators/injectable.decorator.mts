import type { ClassType } from '@navios/di'

import {
  Injectable as OriginalInjectable,
  type InjectableOptions,
} from '@navios/di'

import { createClassContext } from '../context-compat.mjs'

export type { InjectableOptions }

/**
 * Legacy-compatible Injectable decorator.
 *
 * Works with TypeScript experimental decorators (legacy API).
 *
 * @param options - Injectable configuration options
 * @returns A class decorator compatible with legacy decorator API
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class UserService {
 *   getUser(id: string) {
 *     return { id, name: 'John' }
 *   }
 * }
 * ```
 */
export function Injectable(options: InjectableOptions = {}) {
  return function (target: ClassType) {
    const context = createClassContext(target)
    // Use the no-args overload when options is empty, otherwise pass options
    const originalDecorator =
      Object.keys(options).length === 0
        ? OriginalInjectable()
        : // @ts-expect-error - InjectableOptions is a union type, we let runtime handle it
          OriginalInjectable(options)
    return originalDecorator(target, context)
  }
}
