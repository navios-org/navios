import { AttributeFactory } from '@navios/server/legacy-compat'

import { ApiTagSchema, ApiTagToken } from '../annotations/api-tag.mjs'

const BaseApiTag = AttributeFactory.createAttribute(ApiTagToken, ApiTagSchema)

export function ApiTag(name: string, description?: string) {
  return BaseApiTag(description === undefined ? { name } : { name, description })
}
