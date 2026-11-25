import { AttributeFactory } from '@navios/server/legacy-compat'

import { ApiSummarySchema, ApiSummaryToken } from '../annotations/api-summary.mjs'

export const ApiSummary = AttributeFactory.createAttribute(ApiSummaryToken, ApiSummarySchema)
