import { getTracedMetadata } from './traced-metadata.mjs'

import type { TracedOptions } from './traced-options.mjs'

/**
 * Decorator that marks a class or method for tracing.
 *
 * When applied to a class, all public methods will be traced.
 * When applied to a method, only that method will be traced.
 *
 * The actual tracing is performed by the OpenTelemetry integration
 * when the class is instantiated through the DI container.
 *
 * @param options - Tracing options
 * @returns A decorator function
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
 *
 *   async updateUser(id: string, data: UserData) {
 *     // Creates span: "user-service.updateUser"
 *   }
 * }
 *
 * // Method-level: traces specific method (requires @Traceable or @Traced on class)
 * @Injectable()
 * @Traceable()
 * class OrderService {
 *   @Traced({ name: 'process-order' })
 *   async processOrder(orderId: string) {
 *     // Creates span: "process-order"
 *   }
 *
 *   async getOrder(orderId: string) {
 *     // Not traced
 *   }
 * }
 *
 * // Combined: class-level with method override
 * @Injectable()
 * @Traced({ name: 'payment-service' })
 * class PaymentService {
 *   async createPayment(data: PaymentData) {
 *     // Creates span: "payment-service.createPayment"
 *   }
 *
 *   @Traced({ name: 'heavy-validation', attributes: { critical: true } })
 *   async validatePayment(paymentId: string) {
 *     // Creates span: "heavy-validation" with critical=true
 *   }
 * }
 * ```
 */
export function Traced(options: TracedOptions = {}) {
  return function (target: any, context: ClassDecoratorContext | ClassMethodDecoratorContext) {
    if (context.kind === 'class') {
      // Get or create metadata (preserves method decorators' data)
      const metadata = getTracedMetadata(context, target)

      // Update class-level settings
      metadata.name = options.name ?? metadata.name
      metadata.attributes = { ...metadata.attributes, ...options.attributes }
      metadata.enabled = true // All methods traced

      return target
    } else if (context.kind === 'method') {
      // Method decorator - just store method metadata
      // Does NOT add class to tracked set (class must have @Traceable or @Traced)
      const methodName = String(context.name)

      // Get or create metadata (uses shared context.metadata)
      const metadata = getTracedMetadata(context)

      // Add method-specific metadata
      metadata.methods.set(methodName, {
        methodName,
        name: options.name,
        attributes: options.attributes,
        enabled: true,
      })

      return target
    }

    throw new Error('[Navios] @Traced decorator can only be used on classes or methods.')
  }
}
