import { Controller, Endpoint } from '@navios/server/legacy-compat'

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
  async health() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
    }
  }

  @Endpoint(metricsEndpoint)
  async metrics() {
    return {
      requestCount,
      errorCount,
    }
  }
}
