import type { BenchmarkConfig } from './types.js'

/**
 * Heavy Load Scenario
 *
 * Stress test with high concurrent connections.
 * Tests pure throughput on minimal endpoint.
 */
export const heavyLoadConfig: BenchmarkConfig = {
  name: 'heavy-load',
  description: 'Health endpoint stress test with 250 concurrent connections',
  duration: 60,
  connections: 250,
  pipelining: 10,
  warmup: 5,
  endpoints: [
    {
      path: '/health',
      method: 'GET',
    },
  ],
}
