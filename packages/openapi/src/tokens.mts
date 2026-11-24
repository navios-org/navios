/**
 * Tokens for OpenAPI metadata attributes
 */

/** Token for @ApiTag decorator */
export const ApiTagToken = Symbol.for('navios:openapi:tag')

/** Token for @ApiOperation decorator */
export const ApiOperationToken = Symbol.for('navios:openapi:operation')

/** Token for @ApiSummary decorator */
export const ApiSummaryToken = Symbol.for('navios:openapi:summary')

/** Token for @ApiDeprecated decorator */
export const ApiDeprecatedToken = Symbol.for('navios:openapi:deprecated')

/** Token for @ApiSecurity decorator */
export const ApiSecurityToken = Symbol.for('navios:openapi:security')

/** Token for @ApiExclude decorator */
export const ApiExcludeToken = Symbol.for('navios:openapi:exclude')

/** Token for @ApiStream decorator */
export const ApiStreamToken = Symbol.for('navios:openapi:stream')
