/**
 * Legacy-compatible decorators for projects that cannot use Stage 3 decorators.
 *
 * These decorators use the TypeScript experimental decorator API and convert
 * the arguments to Stage 3 format internally.
 *
 * @example
 * ```typescript
 * import { ApiTag, ApiOperation, ApiSummary } from '@navios/openapi/legacy-compat'
 *
 * @Controller()
 * @ApiTag('Users', 'User management operations')
 * export class UserController {
 *   @Endpoint(getUser)
 *   @ApiSummary('Get user by ID')
 *   async getUser() {}
 * }
 * ```
 */

// Export legacy-compatible decorators
export {
  ApiTag,
  ApiOperation,
  ApiSummary,
  ApiDeprecated,
  ApiSecurity,
  ApiExclude,
  ApiStream,
  type ApiTagOptions,
  type ApiOperationOptions,
  type ApiDeprecatedOptions,
  type ApiSecurityRequirement,
  type ApiStreamOptions,
} from './decorators/index.mjs'

// Re-export tokens for attribute access
export {
  ApiTagToken,
  ApiOperationToken,
  ApiSummaryToken,
  ApiDeprecatedToken,
  ApiSecurityToken,
  ApiExcludeToken,
  ApiStreamToken,
} from '../tokens/index.mjs'

// Re-export services (they don't need legacy compatibility)
export {
  OpenApiGeneratorService,
  EndpointScannerService,
  MetadataExtractorService,
  SchemaConverterService,
  PathBuilderService,
} from '../services/index.mjs'

// Re-export metadata types
export type { OpenApiEndpointMetadata } from '../metadata/index.mjs'
