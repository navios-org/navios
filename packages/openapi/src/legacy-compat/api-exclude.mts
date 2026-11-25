import { AttributeFactory } from '@navios/server/legacy-compat'

import { ApiExcludeToken } from '../annotations/api-exclude.mjs'

export const ApiExclude = AttributeFactory.createAttribute(ApiExcludeToken)
