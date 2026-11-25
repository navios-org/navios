import { AttributeFactory } from '@navios/core'

import { valueSchema } from './value-schema.mjs'

/** Token for @ApiSummary decorator */
export const ApiSummaryToken = Symbol.for('navios:openapi:summary')

export const ApiSummarySchema = valueSchema<string>((value) =>
  typeof value === 'string' ? null : 'expected a string',
)

/** Shorthand for `ApiOperation({ summary })`. Read from the handler only. */
export const ApiSummary = AttributeFactory.createAttribute(ApiSummaryToken, ApiSummarySchema)
