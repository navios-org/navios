/**
 * The documentation attributes for projects that compile with
 * `experimentalDecorators`. They store the same values under the same tokens
 * as the standard ones, so the generated document is identical.
 *
 * ```ts
 * import { ApiSummary, ApiTag } from '@navios/openapi/legacy-compat'
 *
 * @ApiTag('Users')
 * @Controller()
 * export class UsersController {
 *   @ApiSummary('Get a user')
 *   @Endpoint(getUser)
 *   async getUser() {}
 * }
 * ```
 */
export {
  ApiDeprecatedToken,
  ApiExcludeToken,
  ApiOperationToken,
  ApiSecurityToken,
  ApiStreamToken,
  ApiSummaryToken,
  ApiTagToken,
  extractOpenApiMetadata,
} from '../annotations/index.mjs'
export type {
  ApiDeprecatedOptions,
  ApiOperationOptions,
  ApiSecurityRequirement,
  ApiStreamOptions,
  ApiTagOptions,
} from '../annotations/index.mjs'
export { generateOpenApiDocument } from '../document/index.mjs'
export { openApiPlugin } from '../plugin/index.mjs'
export { ApiDeprecated } from './api-deprecated.mjs'
export { ApiExclude } from './api-exclude.mjs'
export { ApiOperation } from './api-operation.mjs'
export { ApiSecurity } from './api-security.mjs'
export { ApiStream } from './api-stream.mjs'
export { ApiSummary } from './api-summary.mjs'
export { ApiTag } from './api-tag.mjs'
