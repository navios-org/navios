import { AttributeFactory } from '@navios/core'

import { isObject } from '../internal/is-object.mjs'

import { optionalField, valueSchema } from './value-schema.mjs'

/** Token for @ApiDeprecated decorator */
export const ApiDeprecatedToken = Symbol.for('navios:openapi:deprecated')

export interface ApiDeprecatedOptions {
  message?: string
}

export const ApiDeprecatedSchema = valueSchema<ApiDeprecatedOptions>((value) =>
  isObject(value) ? optionalField(value, 'message', 'string') : 'expected an object',
)

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
