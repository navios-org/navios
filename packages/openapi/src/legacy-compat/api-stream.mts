import { AttributeFactory } from '@navios/core/legacy-compat'

import { ApiStreamSchema, ApiStreamToken } from '../annotations/api-stream.mjs'

export const ApiStream = AttributeFactory.createAttribute(ApiStreamToken, ApiStreamSchema)
