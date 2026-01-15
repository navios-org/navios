import type { ClassType } from '@navios/di'
import { createClassContext, createMethodContext } from '@navios/di/legacy-compat'

import type { TracedOptions } from '../../interfaces/index.mjs'

import {
  Traced as OriginalTraced,
  TRACED_METADATA_KEY,
  type ClassTracedMetadata,
} from '../../decorators/traced.decorator.mjs'

/**
 * Legacy-compatible Traced decorator for class-level tracing.
 *
 * Works with TypeScript experimental decorators (legacy API).
 *
 * When applied to a class, all public methods will be traced.
 * When applied to a method, only that method will be traced.
 *
 * @param options - Tracing options
 * @returns A decorator compatible with legacy decorator API
 *
 * @example
 * ```typescript
 * // Class-level: traces all methods
 * @Injectable()
 * @Traced({ name: 'user-service' })
 * class UserService {
 *   async getUser(id: string) {
 *     // Creates span: "user-service.getUser"
 *   }
 * }
 *
 * // Method-level: traces specific method
 * @Injectable()
 * class OrderService {
 *   @Traced({ name: 'process-order' })
 *   async processOrder(orderId: string) {
 *     // Creates span: "process-order"
 *   }
 * }
 * ```
 */
export function Traced(options: TracedOptions = {}) {
  // Return an overloaded decorator that handles both class and method cases
  return function (
    target: ClassType | object,
    propertyKeyOrContext?: string | symbol | ClassDecoratorContext,
    descriptor?: PropertyDescriptor,
  ): any {
    // Stage 3 decorator (class): target is class, propertyKeyOrContext is context
    if (
      propertyKeyOrContext &&
      typeof propertyKeyOrContext === 'object' &&
      'kind' in propertyKeyOrContext
    ) {
      // This is a Stage 3 decorator call, delegate to original
      const originalDecorator = OriginalTraced(options)
      return originalDecorator(target, propertyKeyOrContext as ClassDecoratorContext)
    }

    // Legacy class decorator: target is class, no propertyKey
    if (propertyKeyOrContext === undefined) {
      const context = createClassContext(target as ClassType)
      const originalDecorator = OriginalTraced(options)
      return originalDecorator(target, context)
    }

    // Legacy method decorator: target is prototype, propertyKey is method name
    if (descriptor !== undefined) {
      const methodName = String(propertyKeyOrContext)
      const constructor = (target as any).constructor as ClassType

      // Get or create class metadata
      let classMetadata: ClassTracedMetadata = (constructor as any)[TRACED_METADATA_KEY]
      if (!classMetadata) {
        classMetadata = {
          enabled: false, // Only methods are traced, not the whole class
          methods: new Map(),
        }
        ;(constructor as any)[TRACED_METADATA_KEY] = classMetadata
      }

      // Add method metadata
      classMetadata.methods.set(methodName, {
        methodName,
        name: options.name,
        attributes: options.attributes,
        enabled: true,
      })

      return descriptor
    }

    throw new Error(
      '[Navios] @Traced decorator can only be used on classes or methods.',
    )
  }
}
