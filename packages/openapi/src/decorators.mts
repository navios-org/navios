import { AttributeFactory } from '@navios/core'

import {
  ApiDeprecatedSchema,
  ApiOperationSchema,
  ApiSecuritySchema,
  ApiStreamSchema,
  ApiSummarySchema,
  ApiTagSchema,
} from './attributes.mjs'
import {
  ApiDeprecatedToken,
  ApiExcludeToken,
  ApiOperationToken,
  ApiSecurityToken,
  ApiStreamToken,
  ApiSummaryToken,
  ApiTagToken,
} from './tokens.mjs'

/**
 * Every documentation attribute works as a decorator on a module, a
 * controller, a handler method or a `handler()` field, and as a value in
 * `handler(endpoint, { attributes: [ApiSummary('...')] }, fn)`.
 */

/** @internal */
export const ApiTagAttribute = AttributeFactory.createAttribute(ApiTagToken, ApiTagSchema)

/**
 * Groups operations under a tag. On a module or a controller it applies to
 * every handler below it; tags from all three levels are combined.
 *
 * ```ts
 * @ApiTag('Users', 'User management')
 * @Controller()
 * export class UsersController {}
 * ```
 */
export function ApiTag(name: string, description?: string) {
  return ApiTagAttribute(description === undefined ? { name } : { name, description })
}

/**
 * Operation metadata: `summary`, `description`, `operationId`, `deprecated`
 * and `externalDocs`. Read from the handler only.
 */
export const ApiOperation = AttributeFactory.createAttribute(ApiOperationToken, ApiOperationSchema)

/** Shorthand for `ApiOperation({ summary })`. Read from the handler only. */
export const ApiSummary = AttributeFactory.createAttribute(ApiSummaryToken, ApiSummarySchema)

/** @internal */
export const ApiDeprecatedAttribute = AttributeFactory.createAttribute(
  ApiDeprecatedToken,
  ApiDeprecatedSchema,
)

/**
 * Marks an operation as deprecated. On a controller or a module it marks
 * every operation below it.
 */
export function ApiDeprecated(message?: string) {
  return ApiDeprecatedAttribute(message === undefined ? {} : { message })
}

/**
 * Security requirements of an operation: scheme name to scopes. The most
 * specific level wins (handler, then controller, then module).
 */
export const ApiSecurity = AttributeFactory.createAttribute(ApiSecurityToken, ApiSecuritySchema)

/**
 * Leaves an operation out of the document. On a controller or a module it
 * leaves out everything below it.
 */
export const ApiExclude = AttributeFactory.createAttribute(ApiExcludeToken)

/**
 * The content type and description of a `response: 'stream' | 'text' | 'blob'`
 * endpoint. Read from the handler only.
 */
export const ApiStream = AttributeFactory.createAttribute(ApiStreamToken, ApiStreamSchema)
