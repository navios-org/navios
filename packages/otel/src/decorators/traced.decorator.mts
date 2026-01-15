import type { AttributeValue } from '@opentelemetry/api'

import type { TracedOptions } from '../interfaces/index.mjs'

/**
 * Symbol used to store traced metadata on classes and methods.
 */
export const TRACED_METADATA_KEY = Symbol('navios:traced')

/**
 * Metadata stored by the @Traced decorator.
 */
export interface TracedMetadata {
  /**
   * Custom span name.
   */
  name?: string

  /**
   * Additional attributes to add to spans.
   */
  attributes?: Record<string, AttributeValue>

  /**
   * Whether tracing is enabled for this target.
   */
  enabled: boolean
}

/**
 * Method-level traced metadata.
 */
export interface MethodTracedMetadata extends TracedMetadata {
  /**
   * The method name this metadata applies to.
   */
  methodName: string
}

/**
 * Class-level traced metadata.
 */
export interface ClassTracedMetadata extends TracedMetadata {
  /**
   * Method-specific overrides.
   */
  methods: Map<string, MethodTracedMetadata>
}

/**
 * Gets traced metadata from a class.
 */
export function getTracedMetadata(
  target: object,
): ClassTracedMetadata | undefined {
  return (target as any)[TRACED_METADATA_KEY] as ClassTracedMetadata | undefined
}

/**
 * Checks if a class or method has traced metadata.
 */
export function hasTracedMetadata(target: object): boolean {
  return TRACED_METADATA_KEY in target
}

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
 * // Method-level: traces specific method
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
  return function (
    target: any,
    context: ClassDecoratorContext | ClassMethodDecoratorContext,
  ) {
    if (context.kind === 'class') {
      // Class decorator
      const metadata: ClassTracedMetadata = {
        name: options.name,
        attributes: options.attributes,
        enabled: true,
        methods: new Map(),
      }

      // Store metadata on the class
      ;(target as any)[TRACED_METADATA_KEY] = metadata

      return target
    } else if (context.kind === 'method') {
      // Method decorator
      const methodName = String(context.name)

      // Use addInitializer to add metadata during class initialization
      context.addInitializer(function (this: any) {
        const constructor = this.constructor

        // Get or create class metadata
        let classMetadata: ClassTracedMetadata =
          constructor[TRACED_METADATA_KEY]
        if (!classMetadata) {
          classMetadata = {
            enabled: false, // Only methods are traced, not the whole class
            methods: new Map(),
          }
          constructor[TRACED_METADATA_KEY] = classMetadata
        }

        // Add method metadata
        classMetadata.methods.set(methodName, {
          methodName,
          name: options.name,
          attributes: options.attributes,
          enabled: true,
        })
      })

      return target
    }

    throw new Error(
      '[Navios] @Traced decorator can only be used on classes or methods.',
    )
  }
}
