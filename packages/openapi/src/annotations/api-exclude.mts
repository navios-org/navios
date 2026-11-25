import { AttributeFactory } from '@navios/server'

/** Token for @ApiExclude decorator */
export const ApiExcludeToken = Symbol.for('navios:openapi:exclude')

/**
 * Leaves an operation out of the document. On a controller or a module it
 * leaves out everything below it.
 */
export const ApiExclude = AttributeFactory.createAttribute(ApiExcludeToken)
