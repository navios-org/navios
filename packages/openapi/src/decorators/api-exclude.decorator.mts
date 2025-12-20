import { AttributeFactory } from '@navios/core'

import { ApiExcludeToken } from '../tokens/index.mjs'

/**
 * Excludes an endpoint from OpenAPI documentation.
 *
 * Use this decorator for internal endpoints that should not be visible
 * in the public API documentation.
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
export const ApiExclude = AttributeFactory.createAttribute(ApiExcludeToken)
