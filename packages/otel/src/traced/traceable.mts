import { traceableServices } from './traceable-services.mjs'
import { getTracedMetadata } from './traced-metadata.mjs'

import type { TracedOptions } from './traced-options.mjs'

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
