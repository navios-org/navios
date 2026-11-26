import { createClassContext } from '@navios/di/legacy-compat'

import type { ClassType } from '@navios/di'

import { Traceable as OriginalTraceable } from '../traced/traced.mjs'

import type { TracedOptions } from '../traced/traced-metadata.mjs'

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
