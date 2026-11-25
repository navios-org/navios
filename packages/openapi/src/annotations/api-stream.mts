import { AttributeFactory } from '@navios/server'

import { isObject } from '../internal/is-object.mjs'

import { optionalField, valueSchema } from './value-schema.mjs'

/** Token for @ApiStream decorator */
export const ApiStreamToken = Symbol.for('navios:openapi:stream')

export interface ApiStreamOptions {
  contentType: string
  description?: string
}

export const ApiStreamSchema = valueSchema<ApiStreamOptions>((value) => {
  if (!isObject(value)) {
    return 'expected an object'
  }
  if (typeof value.contentType !== 'string') {
    return '"contentType" must be a string'
  }
  return optionalField(value, 'description', 'string')
})

/**
 * The content type and description of a `response: 'stream' | 'text' | 'blob'`
 * endpoint. Read from the handler only.
 */
export const ApiStream = AttributeFactory.createAttribute(ApiStreamToken, ApiStreamSchema)
