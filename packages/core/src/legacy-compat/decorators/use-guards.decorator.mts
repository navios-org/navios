import type {
  ClassType,
  ClassTypeWithInstance,
  InjectionToken,
} from '@navios/di'

import type { CanActivate } from '../../interfaces/index.mjs'

import { UseGuards as OriginalUseGuards } from '../../decorators/use-guards.decorator.mjs'
import { createClassContext, createMethodContext } from '../context-compat.mjs'

/**
 * Legacy-compatible UseGuards decorator.
 *
 * Works with TypeScript experimental decorators (legacy API).
 * Can be applied to classes or methods.
 *
 * @param guards - Guard classes or injection tokens to apply
 * @returns A class or method decorator compatible with legacy decorator API
 *
 * @example
 * ```typescript
 * // Apply to a controller
 * @Controller()
 * @UseGuards(AuthGuard, RoleGuard)
 * export class UserController { }
 *
 * // Apply to a specific endpoint
 * @Controller()
 * export class UserController {
 *   @Endpoint(getUserEndpoint)
 *   @UseGuards(AuthGuard)
 *   async getUser() { }
 * }
 * ```
 */
export function UseGuards(
  ...guards: (
    | ClassTypeWithInstance<CanActivate>
    | InjectionToken<CanActivate, undefined>
  )[]
) {
  // Create the decorator function
  // Note: TypeScript's legacy decorator system has strict type checking for decorators
  // We use a flexible implementation that works for both class and method decorators
  function decoratorImpl(
    target: ClassType | Function,
    propertyKey?: string | symbol,
    descriptor?: PropertyDescriptor,
  ): any {
    // Determine if this is a class or method decorator
    if (propertyKey !== undefined && descriptor !== undefined) {
      // Method decorator
      const context = createMethodContext(
        target as Function,
        propertyKey,
        descriptor,
      )
      const originalDecorator = OriginalUseGuards(...guards)
      const result = originalDecorator(descriptor.value, context)
      if (result !== descriptor.value) {
        descriptor.value = result
      }
      return descriptor
    } else {
      // Class decorator
      const context = createClassContext(target as ClassType)
      const originalDecorator = OriginalUseGuards(...guards)
      return originalDecorator(target as ClassType, context)
    }
  }

  // Return with 'any' type to work around TypeScript's strict decorator checking
  // TypeScript's legacy decorator system cannot properly type-check decorators
  // that work as both class and method decorators. The runtime behavior is correct.
  // When used as a class decorator, it returns the class (preserving type at runtime)
  // When used as a method decorator, it returns the PropertyDescriptor
  // @ts-ignore - TypeScript limitation with dual-purpose legacy decorators
  return decoratorImpl as any
}
