import { AttributeFactory } from '@navios/server/legacy-compat'

import { ApiDeprecatedSchema, ApiDeprecatedToken } from '../annotations/api-deprecated.mjs'

const BaseApiDeprecated = AttributeFactory.createAttribute(ApiDeprecatedToken, ApiDeprecatedSchema)

export function ApiDeprecated(message?: string) {
  return BaseApiDeprecated(message === undefined ? {} : { message })
}
