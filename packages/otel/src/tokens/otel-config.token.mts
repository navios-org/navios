import { InjectionToken } from '@navios/di'

import type { ResolvedOtelConfig } from '../interfaces/index.mjs'

/**
 * Injection token for the resolved OpenTelemetry configuration.
 *
 * This token provides access to the fully resolved configuration
 * with all defaults applied.
 *
 * @example
 * ```typescript
 * import { inject, Injectable } from '@navios/di'
 * import { OtelConfigToken } from '@navios/otel'
 *
 * @Injectable()
 * class MyService {
 *   private readonly config = inject(OtelConfigToken)
 *
 *   shouldIncludeNaviosAttributes(): boolean {
 *     return this.config.includeNaviosAttributes
 *   }
 * }
 * ```
 */
export const OtelConfigToken =
  InjectionToken.create<ResolvedOtelConfig>('OtelConfig')
