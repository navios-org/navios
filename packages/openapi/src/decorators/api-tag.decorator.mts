import { AttributeFactory } from '@navios/core'
import { z } from 'zod/v4'

import { ApiTagToken } from '../tokens/index.mjs'

const ApiTagSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
})

/** Options for the @ApiTag decorator, inferred from the schema */
export type ApiTagOptions = z.infer<typeof ApiTagSchema>

const BaseApiTag = AttributeFactory.createAttribute(ApiTagToken, ApiTagSchema)

/**
 * Groups endpoints under a specific tag/folder in the documentation.
 *
 * Can be applied to controllers (affects all endpoints) or individual methods.
 * When applied to both, the method-level tag takes precedence.
 *
 * @param name - The tag name
 * @param description - Optional tag description
 *
 * @example
 * ```typescript
 * // Apply to entire controller
 * @Controller()
 * @ApiTag('Users', 'User management operations')
 * export class UserController {
 *   @Endpoint(getUser)
 *   async getUser() {}
 * }
 *
 * // Apply to individual endpoint
 * @Controller()
 * export class MixedController {
 *   @Endpoint(getUser)
 *   @ApiTag('Users')
 *   async getUser() {}
 *
 *   @Endpoint(getOrder)
 *   @ApiTag('Orders')
 *   async getOrder() {}
 * }
 * ```
 */
export function ApiTag(name: string, description?: string) {
  return BaseApiTag({ name, description })
}
