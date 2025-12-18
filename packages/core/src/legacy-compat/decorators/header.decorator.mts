import type { HttpHeader } from '../../interfaces/index.mjs'

import { Header as OriginalHeader } from '../../decorators/header.decorator.mjs'
import { createMethodContext } from '../context-compat.mjs'

/**
 * Legacy-compatible Header decorator.
 * 
 * Works with TypeScript experimental decorators (legacy API).
 * 
 * @param name - The header name (e.g., 'Content-Type', 'Cache-Control')
 * @param value - The header value (string, number, or array of strings)
 * @returns A method decorator compatible with legacy decorator API
 * 
 * @example
 * ```typescript
 * @Controller()
 * export class UserController {
 *   @Endpoint(getUserEndpoint)
 *   @Header('Cache-Control', 'max-age=3600')
 *   async getUser() {
 *     return { id: '1', name: 'John' }
 *   }
 * }
 * ```
 */
export function Header(name: HttpHeader, value: string | number | string[]) {
  return function <T extends object>(
    target: T,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    const context = createMethodContext(target, propertyKey, descriptor)
    const originalDecorator = OriginalHeader(name, value)
    const result = originalDecorator(descriptor.value, context)
    if (result !== descriptor.value) {
      descriptor.value = result
    }
    return descriptor
  }
}

