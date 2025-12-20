import type { EndpointParams, EndpointResult } from '@navios/core'

import { Controller, Endpoint } from '@navios/core'
import { ApiSummary, ApiTag } from '@navios/openapi'

import { healthCheck } from '../api.mjs'

@ApiTag('System', 'System operations')
@Controller()
export class HealthController {
  @Endpoint(healthCheck)
  @ApiSummary('Health check')
  async healthCheck(
    params: EndpointParams<typeof healthCheck>,
  ): EndpointResult<typeof healthCheck> {
    return {
      status: 'healthy' as const,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    }
  }
}
