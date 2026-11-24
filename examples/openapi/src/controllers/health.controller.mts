import { Controller, handler } from '@navios/core'
import { ApiSummary, ApiTag } from '@navios/openapi'

import { healthCheck } from '../api.mjs'

@ApiTag('System', 'System operations')
@Controller()
export class HealthController {
  @ApiSummary('Health check')
  healthCheck = handler(healthCheck, () => ({
    status: 'healthy' as const,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  }))
}
