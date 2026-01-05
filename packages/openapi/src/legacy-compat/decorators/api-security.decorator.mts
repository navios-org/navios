import { LegacyAttributeFactory } from '@navios/core/legacy-compat'
import { z } from 'zod/v4'

import { ApiSecurityToken } from '../../tokens/index.mjs'

const ApiSecuritySchema = z.record(z.string(), z.array(z.string()))

/** Security requirement for an endpoint, inferred from the schema */
export type ApiSecurityRequirement = z.infer<typeof ApiSecuritySchema>

/**
 * Specifies security requirements for an endpoint.
 *
 * The security requirement object maps security scheme names to their scopes.
 * For schemes that don't use scopes (like API keys), use an empty array.
 *
 * Legacy-compatible version for TypeScript experimental decorators.
 *
 * @param requirements - Security requirements object
 *
 * @example
 * ```typescript
 * @Controller()
 * export class UserController {
 *   // Require bearer token authentication
 *   @Endpoint(getUser)
 *   @ApiSecurity({ bearerAuth: [] })
 *   async getUser() {}
 *
 *   // Require multiple authentication methods
 *   @Endpoint(adminEndpoint)
 *   @ApiSecurity({ bearerAuth: [], apiKey: [] })
 *   async adminAction() {}
 *
 *   // OAuth2 with specific scopes
 *   @Endpoint(writeUser)
 *   @ApiSecurity({ oauth2: ['users:write', 'users:read'] })
 *   async writeUser() {}
 * }
 * ```
 */
export const ApiSecurity = LegacyAttributeFactory.createAttribute(
  ApiSecurityToken,
  ApiSecuritySchema,
)
