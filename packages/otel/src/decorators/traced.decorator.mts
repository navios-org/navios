import type { ClassType } from '@navios/di'
import type { AttributeValue } from '@opentelemetry/api'

import type { TracedOptions } from '../interfaces/index.mjs'

/**
 * Symbol used to store traced metadata on classes and in context.metadata.
 */
export const TracedMetadataKey = Symbol('navios:traced:metadata')

/**
 * @deprecated Use TracedMetadataKey instead
 */
export const TRACED_METADATA_KEY = TracedMetadataKey

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

// Track all @Traceable/@Traced decorated classes
// This Set is populated at decoration time (module load), not at instantiation
const traceableServices = new Set<ClassType>()

/**
 * Returns the set of all classes decorated with @Traceable or @Traced.
 * Used by the plugin to find services that need wrapping.
 */
export function getTraceableServices(): ReadonlySet<ClassType> {
  return traceableServices
}

/**
 * Gets or creates traced metadata during decoration.
 * Used inside decorators with access to context.metadata.
 *
 * For class decorators, also stores on target for runtime extraction.
 * For method decorators, only uses context.metadata (shared with class decorator).
 *
 * @param context - The decorator context
 * @param target - The class being decorated (only for class decorators)
 * @returns The class traced metadata
 */
export function getTracedMetadata(
  context: ClassDecoratorContext | ClassMethodDecoratorContext,
  target?: ClassType,
): ClassTracedMetadata {
  if (!context.metadata) {
    throw new Error('[Navios] Wrong environment.')
  }

  const existingMetadata = context.metadata[TracedMetadataKey] as ClassTracedMetadata | undefined

  if (existingMetadata) {
    // For class decorators, ensure metadata is stored on target for runtime extraction
    // This handles the case where method decorators created the metadata first
    if (target) {
      // @ts-expect-error Store on target for extraction later
      target[TracedMetadataKey] = existingMetadata
    }
    return existingMetadata
  }

  const newMetadata: ClassTracedMetadata = {
    name: undefined,
    attributes: undefined,
    enabled: false,
    methods: new Map(),
  }

  context.metadata[TracedMetadataKey] = newMetadata

  // For class decorators, also store on target for runtime extraction
  if (target) {
    // @ts-expect-error Store on target for extraction later
    target[TracedMetadataKey] = newMetadata
  }

  return newMetadata
}

/**
 * Extracts traced metadata from an already-decorated class.
 * Used at runtime when context is not available.
 *
 * @param target - The decorated class
 * @returns The class traced metadata
 * @throws Error if metadata not found
 */
export function extractTracedMetadata(target: ClassType): ClassTracedMetadata {
  // @ts-expect-error We store metadata directly on target
  const metadata = target[TracedMetadataKey] as ClassTracedMetadata | undefined
  if (!metadata) {
    throw new Error(
      '[Navios] Traced metadata not found. Make sure to use @Traceable or @Traced decorator.',
    )
  }
  return metadata
}

/**
 * Checks if a class has traced metadata.
 *
 * @param target - The class to check
 * @returns True if the class has traced metadata
 */
export function hasTracedMetadata(target: ClassType): boolean {
  // @ts-expect-error We store metadata directly on target
  return !!target[TracedMetadataKey]
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
  return function (target: any, context: ClassDecoratorContext) {
    // Add to tracked set immediately (at decoration time)
    traceableServices.add(target)

    // Get or create metadata (preserves method decorators' data)
    const metadata = getTracedMetadata(context, target)

    // Update class-level settings
    metadata.name = options.name
    metadata.attributes = options.attributes
    metadata.enabled = false // Methods not traced by default

    return target
  }
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
      // Add to tracked set immediately (at decoration time)
      traceableServices.add(target)

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
