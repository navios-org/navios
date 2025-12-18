import { HttpCode as OriginalHttpCode } from '../../decorators/http-code.decorator.mjs'
import { createMethodContext } from '../context-compat.mjs'

/**
 * Legacy-compatible HttpCode decorator.
 *
 * Works with TypeScript experimental decorators (legacy API).
 *
 * @param code - The HTTP status code to return (e.g., 201, 204, 202)
 * @returns A method decorator compatible with legacy decorator API
 *
 * @example
 * ```typescript
 * @Controller()
 * export class UserController {
 *   @Endpoint(createUserEndpoint)
 *   @HttpCode(201)
 *   async createUser() {
 *     return { id: '1', name: 'John' }
 *   }
 * }
 * ```
 */
export function HttpCode(code: number) {
  return function <T extends object>(
    target: T,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    const context = createMethodContext(target, propertyKey, descriptor)
    const originalDecorator = OriginalHttpCode(code)
    const result = originalDecorator(descriptor.value, context)
    if (result !== descriptor.value) {
      descriptor.value = result
    }
    return descriptor
  }
}
