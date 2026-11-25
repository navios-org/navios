import { attachClasses } from '../metadata/attach-classes.mjs'

import type { GuardClass } from './guard.mjs'

/**
 * Adds guards to a module, a controller or a handler. Guards run in the
 * order module, controller, handler, and within one level in the order given.
 *
 * On a class, place it above `@Controller` / `@Module`.
 */
export function UseGuards(...guards: GuardClass[]) {
  return attachClasses('guards', guards, 'UseGuards')
}
