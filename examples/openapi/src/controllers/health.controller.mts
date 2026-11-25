import { Controller, Endpoint } from '@navios/server'
import { ApiSummary, ApiTag } from '@navios/openapi'

import { healthCheck } from '../api.mjs'

@ApiTag('System', 'System operations')
@Controller()
export class HealthController {
  @Endpoint(healthCheck)
  @ApiSummary('Health check')
  healthCheck() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    }
  }
}
