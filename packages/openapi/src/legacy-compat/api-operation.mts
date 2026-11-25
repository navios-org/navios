import { AttributeFactory } from '@navios/core/legacy-compat'

import { ApiOperationSchema, ApiOperationToken } from '../annotations/api-operation.mjs'

export const ApiOperation = AttributeFactory.createAttribute(ApiOperationToken, ApiOperationSchema)
