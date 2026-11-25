import { AttributeFactory } from '@navios/core/legacy-compat'

import { ApiExcludeToken } from '../annotations/api-exclude.mjs'

export const ApiExclude = AttributeFactory.createAttribute(ApiExcludeToken)
