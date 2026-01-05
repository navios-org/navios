import { LegacyAttributeFactory } from '@navios/core/legacy-compat'
import { z } from 'zod/v4'

import { ApiSummaryToken } from '../../tokens/index.mjs'

const ApiSummarySchema = z.string()

/**
 * Shorthand decorator for adding just a summary to an endpoint.
 *
 * This is equivalent to `@ApiOperation({ summary: '...' })` but more concise.
 *
 * Legacy-compatible version for TypeScript experimental decorators.
 *
 * @param summary - Short summary text for the endpoint
 *
 * @example
 * ```typescript
 * @Controller()
 * export class UserController {
 *   @Endpoint(getUser)
 *   @ApiSummary('Get user by ID')
 *   async getUser() {}
 *
 *   @Endpoint(createUser)
 *   @ApiSummary('Create a new user')
 *   async createUser() {}
 * }
 * ```
 */
export const ApiSummary = LegacyAttributeFactory.createAttribute(
  ApiSummaryToken,
  ApiSummarySchema,
)
