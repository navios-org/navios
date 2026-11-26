import { inject, registerInjectable } from '@navios/core'

import type { ClassType } from '@navios/core'

import { TracerToken } from '../sdk/tracer-token.mjs'

import { traceInstance } from './trace-instance.mjs'

/**
 * Applies `@Traced` metadata to instances the container did not build.
 *
 * Services resolved from the container are traced by the plugin; this
 * service is for objects created by hand.
 *
 * @example
 * ```typescript
 * const factory = await container.get(TracedProxyFactory)
 * const traced = factory.wrap(new ReportBuilder(), ReportBuilder)
 * ```
 */
export class TracedProxyFactory {
  private readonly tracer = inject(TracerToken)

  /**
   * Instruments an instance in place and returns it. See `traceInstance`.
   */
  wrap<T extends object>(instance: T, classType: ClassType): T {
    return traceInstance(instance, classType, this.tracer)
  }
}

registerInjectable(TracedProxyFactory)
