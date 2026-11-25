import { AttributeFactory } from '@navios/core'

import { isObject } from '../internal/is-object.mjs'

import { optionalField, valueSchema } from './value-schema.mjs'

/** Token for @ApiTag decorator */
export const ApiTagToken = Symbol.for('navios:openapi:tag')

export interface ApiTagOptions {
  name: string
  description?: string
}

export const ApiTagSchema = valueSchema<ApiTagOptions>((value) => {
  if (!isObject(value)) {
    return 'expected an object'
  }
  if (typeof value.name !== 'string') {
    return '"name" must be a string'
  }
  return optionalField(value, 'description', 'string')
})

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
