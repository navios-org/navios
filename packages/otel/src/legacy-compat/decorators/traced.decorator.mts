import { createClassContext, createMethodContext } from '@navios/di/legacy-compat'

import type { ClassType } from '@navios/di'

import {
  Traced as OriginalTraced,
  Traceable as OriginalTraceable,
  TRACED_METADATA_KEY,
  TracedMetadataKey,
  getTraceableServices,
  extractTracedMetadata,
  hasTracedMetadata,
  type ClassTracedMetadata,
  type MethodTracedMetadata,
  type TracedMetadata,
} from '../../decorators/traced.decorator.mjs'

import type { TracedOptions } from '../../interfaces/index.mjs'

// Re-export metadata helpers and types (they work the same for both APIs)
export {
  TRACED_METADATA_KEY,
  TracedMetadataKey,
  getTraceableServices,
  extractTracedMetadata,
  hasTracedMetadata,
  type ClassTracedMetadata,
  type MethodTracedMetadata,
  type TracedMetadata,
}

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
      const context = createMethodContext(target, propertyKeyOrContext, descriptor)
      const originalDecorator = OriginalTraced(options)
      const result = originalDecorator(descriptor.value, context)
      if (result !== descriptor.value) {
        descriptor.value = result
      }
      return descriptor
    }

    throw new Error('[Navios] @Traced decorator can only be used on classes or methods.')
  }
}

/**
 * Legacy-compatible Traceable decorator for class-level tracing setup.
 *
 * Works with TypeScript experimental decorators (legacy API).
 *
 * Use `@Traceable` when you want to:
 * - Mark a class for tracing proxy wrapping
 * - Only trace specific methods decorated with `@Traced`
 *
 * @param options - Tracing options (name, attributes)
 * @returns A decorator compatible with legacy decorator API
 *
 * @example
 * ```typescript
 * @Injectable()
 * @Traceable({ name: 'order-service' })
 * class OrderService {
 *   @Traced({ name: 'process-order' })
 *   async processOrder(orderId: string) {
 *     // Traced as "process-order"
 *   }
 *
 *   async getOrder(orderId: string) {
 *     // NOT traced
 *   }
 * }
 * ```
 */
export function Traceable(options: TracedOptions = {}) {
  return function (target: ClassType, contextOrUndefined?: ClassDecoratorContext): any {
    // Stage 3 decorator: target is class, contextOrUndefined is context
    if (
      contextOrUndefined &&
      typeof contextOrUndefined === 'object' &&
      'kind' in contextOrUndefined
    ) {
      // This is a Stage 3 decorator call, delegate to original
      const originalDecorator = OriginalTraceable(options)
      return originalDecorator(target, contextOrUndefined)
    }

    // Legacy class decorator: target is class, no context
    const context = createClassContext(target)
    const originalDecorator = OriginalTraceable(options)
    return originalDecorator(target, context)
  }
}
