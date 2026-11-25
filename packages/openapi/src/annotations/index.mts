/**
 * Every documentation attribute works as a decorator on a module, a
 * controller, a handler method or a `handler()` field, and as a value in
 * `handler(endpoint, { attributes: [ApiSummary('...')] }, fn)`.
 */

export { ApiDeprecated, ApiDeprecatedToken } from './api-deprecated.mjs'
export type { ApiDeprecatedOptions } from './api-deprecated.mjs'
export { ApiExclude, ApiExcludeToken } from './api-exclude.mjs'
export { ApiOperation, ApiOperationToken } from './api-operation.mjs'
export type { ApiOperationOptions } from './api-operation.mjs'
export { ApiSecurity, ApiSecurityToken } from './api-security.mjs'
export type { ApiSecurityRequirement } from './api-security.mjs'
export { ApiStream, ApiStreamToken } from './api-stream.mjs'
export type { ApiStreamOptions } from './api-stream.mjs'
export { ApiSummary, ApiSummaryToken } from './api-summary.mjs'
export { ApiTag, ApiTagToken } from './api-tag.mjs'
export type { ApiTagOptions } from './api-tag.mjs'
export { extractOpenApiMetadata } from './endpoint-metadata.mjs'
export type { OpenApiEndpointMetadata } from './endpoint-metadata.mjs'
