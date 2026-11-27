import { registerInjectable } from '../provider/registration.mjs'

import type {
  InjectableOptions,
  Injectable as StandardInjectable,
} from '../decorators/injectable.mjs'
import type { ClassType } from '../token/class-type.mjs'

import { assertLegacyClass } from './context-compat.mjs'

/**
 * Legacy-compatible Injectable decorator.
 *
 * Works with TypeScript experimental decorators (legacy API).
 *
 * Checked at compile time like the standard `@Injectable`: the class against
 * the type of the token, and its constructor against the schema.
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
export const Injectable = function Injectable(options: InjectableOptions = {}) {
  return <T extends ClassType>(target: T): T => {
    assertLegacyClass('Injectable', target)
    registerInjectable(target, options)
    return target
  }
} as typeof StandardInjectable
