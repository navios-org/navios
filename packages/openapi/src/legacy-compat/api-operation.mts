import { AttributeFactory } from '@navios/server/legacy-compat'

import { ApiOperationSchema, ApiOperationToken } from '../annotations/api-operation.mjs'

export const ApiOperation = AttributeFactory.createAttribute(ApiOperationToken, ApiOperationSchema)
