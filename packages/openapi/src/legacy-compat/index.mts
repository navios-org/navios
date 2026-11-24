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
import { AttributeFactory } from '@navios/core/legacy-compat'

import {
  ApiDeprecatedSchema,
  ApiOperationSchema,
  ApiSecuritySchema,
  ApiStreamSchema,
  ApiSummarySchema,
  ApiTagSchema,
} from '../attributes.mjs'
import {
  ApiDeprecatedToken,
  ApiExcludeToken,
  ApiOperationToken,
  ApiSecurityToken,
  ApiStreamToken,
  ApiSummaryToken,
  ApiTagToken,
} from '../tokens.mjs'

const BaseApiTag = AttributeFactory.createAttribute(ApiTagToken, ApiTagSchema)

export function ApiTag(name: string, description?: string) {
  return BaseApiTag(description === undefined ? { name } : { name, description })
}

export const ApiOperation = AttributeFactory.createAttribute(ApiOperationToken, ApiOperationSchema)

export const ApiSummary = AttributeFactory.createAttribute(ApiSummaryToken, ApiSummarySchema)

const BaseApiDeprecated = AttributeFactory.createAttribute(ApiDeprecatedToken, ApiDeprecatedSchema)

export function ApiDeprecated(message?: string) {
  return BaseApiDeprecated(message === undefined ? {} : { message })
}

export const ApiSecurity = AttributeFactory.createAttribute(ApiSecurityToken, ApiSecuritySchema)

export const ApiExclude = AttributeFactory.createAttribute(ApiExcludeToken)

export const ApiStream = AttributeFactory.createAttribute(ApiStreamToken, ApiStreamSchema)

export type {
  ApiDeprecatedOptions,
  ApiOperationOptions,
  ApiSecurityRequirement,
  ApiStreamOptions,
  ApiTagOptions,
} from '../attributes.mjs'

export {
  ApiTagToken,
  ApiOperationToken,
  ApiSummaryToken,
  ApiDeprecatedToken,
  ApiSecurityToken,
  ApiExcludeToken,
  ApiStreamToken,
} from '../tokens.mjs'

export { openApiPlugin } from '../plugin.mjs'
export { generateOpenApiDocument } from '../document.mjs'
export { extractOpenApiMetadata } from '../metadata.mjs'
