import { attachClasses } from '../metadata/attach-classes.mjs'

import type { Interceptor } from './interceptor.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

type InterceptorClass = new (...args: any[]) => Interceptor

/**
 * Adds interceptors to a module, a controller or a handler. The first one
 * given is the outermost.
 *
 * On a class, place it above `@Controller` / `@Module`.
 */
export function UseInterceptors(...interceptors: InterceptorClass[]) {
  return attachClasses('interceptors', interceptors, 'UseInterceptors')
}
