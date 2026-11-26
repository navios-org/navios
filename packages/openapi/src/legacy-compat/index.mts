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
import { AttributeFactory } from '@navios/server/legacy-compat'

import {
  ApiDeprecatedSchema,
  ApiDeprecatedToken,
  apiDeprecatedValue,
  ApiExcludeToken,
  ApiOperationSchema,
  ApiOperationToken,
  ApiSecuritySchema,
  ApiSecurityToken,
  ApiStreamSchema,
  ApiStreamToken,
  ApiSummarySchema,
  ApiSummaryToken,
  ApiTagSchema,
  ApiTagToken,
  apiTagValue,
} from '../annotations/index.mjs'

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
export { generateOpenApiDocument } from '../document/generate-document.mjs'
export { openApiPlugin } from '../plugin/openapi-plugin.mjs'

const ApiDeprecatedAttribute = AttributeFactory.createAttribute(
  ApiDeprecatedToken,
  ApiDeprecatedSchema,
)
const ApiTagAttribute = AttributeFactory.createAttribute(ApiTagToken, ApiTagSchema)

/** `ApiDeprecated` of `@navios/openapi` as a legacy decorator. */
export function ApiDeprecated(message?: string) {
  return ApiDeprecatedAttribute(apiDeprecatedValue(message))
}

/** `ApiExclude` of `@navios/openapi` as a legacy decorator. */
export const ApiExclude = AttributeFactory.createAttribute(ApiExcludeToken)

/** `ApiOperation` of `@navios/openapi` as a legacy decorator. */
export const ApiOperation = AttributeFactory.createAttribute(ApiOperationToken, ApiOperationSchema)

/** `ApiSecurity` of `@navios/openapi` as a legacy decorator. */
export const ApiSecurity = AttributeFactory.createAttribute(ApiSecurityToken, ApiSecuritySchema)

/** `ApiStream` of `@navios/openapi` as a legacy decorator. */
export const ApiStream = AttributeFactory.createAttribute(ApiStreamToken, ApiStreamSchema)

/** `ApiSummary` of `@navios/openapi` as a legacy decorator. */
export const ApiSummary = AttributeFactory.createAttribute(ApiSummaryToken, ApiSummarySchema)

/** `ApiTag` of `@navios/openapi` as a legacy decorator. */
export function ApiTag(name: string, description?: string) {
  return ApiTagAttribute(apiTagValue(name, description))
}
