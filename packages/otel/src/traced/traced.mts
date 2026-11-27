import type { ClassType } from '@navios/core'

import { traceMarkedMethod } from './trace-instance.mjs'
import { getTracedMetadata, markClass } from './traced-metadata.mjs'

import type { TracedOptions } from './traced-metadata.mjs'

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
 * // Method-level: traces that method only. `@Traceable` on the class is
 * // optional; it gives the spans of the class a name and attributes.
 * @Injectable()
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
    if (context.kind === 'method') {
      const methodName = String(context.name)
      const metadata = getTracedMetadata(context)
      metadata.methods.set(methodName, {
        methodName,
        name: options.name,
        attributes: options.attributes,
        enabled: true,
      })
      // A method decorator does not see its class, and the class may have no
      // `@Traced` or `@Traceable` that would record it for the plugin. Such
      // an instance traces the method itself, while it is constructed.
      if (!context.static && !context.private) {
        context.addInitializer(function (this: unknown) {
          traceMarkedMethod(this as object, methodName, metadata)
        })
      }
    } else {
      markClass(target, context, options, true)
    }
    return target
  }
}

/**
 * Decorator that marks a class for tracing without enabling all methods.
 *
 * Use `@Traceable` when you want to:
 * - Mark a class for tracing proxy wrapping
 * - Only trace specific methods decorated with `@Traced`
 *
 * @param options - Tracing options (name, attributes)
 * @returns A class decorator
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
  return function <T extends ClassType>(target: T, context: ClassDecoratorContext): T {
    markClass(target, context, options, false)
    return target
  }
}
