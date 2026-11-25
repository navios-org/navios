import { attachClasses } from '../metadata/attach-classes.mjs'

import type { InterceptorClass } from './interceptor.mjs'

/**
 * Adds interceptors to a module, a controller or a handler. The first one
 * given is the outermost. They run for what the guards let through, unlike the
 * interceptors of the application.
 *
 * On a class, place it above `@Controller` / `@Module`.
 */
export function UseInterceptors(...interceptors: InterceptorClass[]) {
  return attachClasses('interceptors', interceptors, 'UseInterceptors')
}
