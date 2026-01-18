import type { EndpointParams } from '@navios/core'

import { Controller, Endpoint } from '@navios/core/legacy-compat'

import { healthEndpoint, metricsEndpoint } from '../../api/endpoints.mjs'

// Simple in-memory metrics for demonstration
let requestCount = 0
let errorCount = 0

export function incrementRequestCount() {
  requestCount++
}

export function incrementErrorCount() {
  errorCount++
}

const startTime = Date.now()

@Controller()
export class AppController {
  @Endpoint(healthEndpoint)
  async health(params: EndpointParams<typeof healthEndpoint>) {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
    }
  }

  @Endpoint(metricsEndpoint)
  async metrics(params: EndpointParams<typeof metricsEndpoint>) {
    return {
      requestCount,
      errorCount,
    }
  }
}
