import { AttributeFactory } from '@navios/server/legacy-compat'

import { ApiStreamSchema, ApiStreamToken } from '../annotations/api-stream.mjs'

export const ApiStream = AttributeFactory.createAttribute(ApiStreamToken, ApiStreamSchema)
