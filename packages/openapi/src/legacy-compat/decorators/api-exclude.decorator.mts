import { LegacyAttributeFactory } from '@navios/core/legacy-compat'

import { ApiExcludeToken } from '../../tokens/index.mjs'

/**
 * Excludes an endpoint from OpenAPI documentation.
 *
 * Use this decorator for internal endpoints that should not be visible
 * in the public API documentation.
 *
 * Legacy-compatible version for TypeScript experimental decorators.
 *
 * @example
 * ```typescript
 * @Controller()
 * export class HealthController {
 *   @Endpoint(healthCheck)
 *   @ApiExclude()
 *   async healthCheck() {
 *     return { status: 'ok' }
 *   }
 *
 *   @Endpoint(internalMetrics)
 *   @ApiExclude()
 *   async internalMetrics() {
 *     return { ... }
 *   }
 * }
 * ```
 */
export const ApiExclude = LegacyAttributeFactory.createAttribute(ApiExcludeToken)
