import { Token } from '@navios/di'

import type { ResolvedOtelConfig } from '../interfaces/index.mjs'

/**
 * Injection token for the resolved OpenTelemetry configuration.
 *
 * This token provides access to the fully resolved configuration
 * with all defaults applied.
 *
 * @example
 * ```typescript
 * import { Inject, Injectable } from '@navios/di'
 * import { OtelConfigToken } from '@navios/otel'
 *
 * @Injectable()
 * class MyService {
 *   @Inject(OtelConfigToken) private accessor config!: ResolvedOtelConfig
 *
 *   shouldIncludeNaviosAttributes(): boolean {
 *     return this.config.includeNaviosAttributes
 *   }
 * }
 * ```
 */
export const OtelConfigToken = Token.create<ResolvedOtelConfig>('OtelConfig')
