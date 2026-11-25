import { AttributeFactory } from '@navios/core'

import { isObject } from '../internal/is-object.mjs'

import { valueSchema } from './value-schema.mjs'

/** Token for @ApiSecurity decorator */
export const ApiSecurityToken = Symbol.for('navios:openapi:security')

/** Maps a security scheme name to the scopes it requires. */
export type ApiSecurityRequirement = Record<string, string[]>

export const ApiSecuritySchema = valueSchema<ApiSecurityRequirement>((value) => {
  if (!isObject(value)) {
    return 'expected an object'
  }
  for (const [name, scopes] of Object.entries(value)) {
    if (!Array.isArray(scopes) || scopes.some((scope) => typeof scope !== 'string')) {
      return `"${name}" must be an array of strings`
    }
  }
  return null
})

/**
 * Security requirements of an operation: scheme name to scopes. The most
 * specific level wins (handler, then controller, then module).
 */
export const ApiSecurity = AttributeFactory.createAttribute(ApiSecurityToken, ApiSecuritySchema)
