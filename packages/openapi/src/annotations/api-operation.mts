import { AttributeFactory } from '@navios/server'

import { isObject } from '../internal/is-object.mjs'

import { firstError, optionalField, valueSchema } from './value-schema.mjs'

/** Token for @ApiOperation decorator */
export const ApiOperationToken = Symbol.for('navios:openapi:operation')

export interface ApiOperationOptions {
  summary?: string
  description?: string
  operationId?: string
  deprecated?: boolean
  externalDocs?: {
    url: string
    description?: string
  }
}

export const ApiOperationSchema = valueSchema<ApiOperationOptions>((value) => {
  if (!isObject(value)) {
    return 'expected an object'
  }
  const { externalDocs } = value
  if (externalDocs !== undefined) {
    if (!isObject(externalDocs) || typeof externalDocs.url !== 'string') {
      return '"externalDocs" must be an object with a string "url"'
    }
    const error = optionalField(externalDocs, 'description', 'string')
    if (error) {
      return `externalDocs: ${error}`
    }
  }
  return firstError(
    optionalField(value, 'summary', 'string'),
    optionalField(value, 'description', 'string'),
    optionalField(value, 'operationId', 'string'),
    optionalField(value, 'deprecated', 'boolean'),
  )
})

/**
 * Operation metadata: `summary`, `description`, `operationId`, `deprecated`
 * and `externalDocs`. Read from the handler only.
 */
export const ApiOperation = AttributeFactory.createAttribute(ApiOperationToken, ApiOperationSchema)
