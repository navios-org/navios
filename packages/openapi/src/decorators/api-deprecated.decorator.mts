import { AttributeFactory } from '@navios/core'
import { z } from 'zod/v4'

import { ApiDeprecatedToken } from '../tokens/index.mjs'

const ApiDeprecatedSchema = z.object({
  message: z.string().optional(),
})

/** Options for the @ApiDeprecated decorator, inferred from the schema */
export type ApiDeprecatedOptions = z.infer<typeof ApiDeprecatedSchema>

const BaseApiDeprecated = AttributeFactory.createAttribute(ApiDeprecatedToken, ApiDeprecatedSchema)

/**
 * Marks an endpoint as deprecated.
 *
 * Deprecated endpoints are shown with a visual indicator in documentation
 * and may include a migration message.
 *
 * @param message - Optional deprecation message
 *
 * @example
 * ```typescript
 * @Controller()
 * export class UserController {
 *   // Simple deprecation
 *   @Endpoint(legacyGetUser)
 *   @ApiDeprecated()
 *   async getLegacyUser() {}
 *
 *   // With migration message
 *   @Endpoint(oldCreateUser)
 *   @ApiDeprecated('Use POST /v2/users instead')
 *   async oldCreateUser() {}
 * }
 * ```
 */
export function ApiDeprecated(message?: string) {
  return BaseApiDeprecated({ message })
}
