import { AttributeFactory } from '@navios/core/legacy-compat'

import { ApiSummarySchema, ApiSummaryToken } from '../annotations/api-summary.mjs'

export const ApiSummary = AttributeFactory.createAttribute(ApiSummaryToken, ApiSummarySchema)
