import type { BenchmarkConfig } from './types.js'

/**
 * Cold Start Scenario
 *
 * Measures the time from process spawn to first successful HTTP response.
 * This tests framework initialization overhead.
 */
export const coldStartConfig: BenchmarkConfig = {
  name: 'cold-start',
  description: 'Measures application startup time until first request succeeds',
  duration: 1, // Just need one successful request
  connections: 1,
  warmup: 0,
  endpoints: [
    {
      path: '/health',
      method: 'GET',
    },
  ],
}

export const COLD_START_ITERATIONS = 10
