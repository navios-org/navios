import { AttributeFactory } from '@navios/core'
import { z } from 'zod/v4'

import { ApiOperationToken } from '../tokens/index.mjs'

const ApiOperationSchema = z.object({
  summary: z.string().optional(),
  description: z.string().optional(),
  operationId: z.string().optional(),
  deprecated: z.boolean().optional(),
  externalDocs: z
    .object({
      url: z.string(),
      description: z.string().optional(),
    })
    .optional(),
})

/** Options for the @ApiOperation decorator, inferred from the schema */
export type ApiOperationOptions = z.infer<typeof ApiOperationSchema>

/**
 * Provides detailed operation metadata for an endpoint.
 *
 * Use this decorator when you need to specify multiple operation properties.
 * For simple cases, consider using @ApiSummary instead.
 *
 * @param options - Operation configuration options
 *
 * @example
 * ```typescript
 * @Controller()
 * export class UserController {
 *   @Endpoint(getUser)
 *   @ApiOperation({
 *     summary: 'Get user by ID',
 *     description: 'Retrieves a user by their unique identifier. Returns 404 if not found.',
 *     operationId: 'getUserById',
 *   })
 *   async getUser(params: EndpointParams<typeof getUser>) {}
 *
 *   @Endpoint(legacyGetUser)
 *   @ApiOperation({
 *     summary: 'Get user (legacy)',
 *     deprecated: true,
 *     externalDocs: {
 *       url: 'https://docs.example.com/migration',
 *       description: 'Migration guide'
 *     }
 *   })
 *   async getLegacyUser() {}
 * }
 * ```
 */
export const ApiOperation = AttributeFactory.createAttribute(ApiOperationToken, ApiOperationSchema)
