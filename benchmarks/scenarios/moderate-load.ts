import type { BenchmarkConfig } from './types.js'

/**
 * Moderate Load Scenario
 *
 * Tests key endpoints with realistic concurrent load.
 * Focuses on common API patterns.
 */
export const moderateLoadConfig: BenchmarkConfig = {
  name: 'moderate-load',
  description: 'Key endpoints tested with 100 concurrent connections',
  duration: 30,
  connections: 100,
  pipelining: 10,
  warmup: 5,
  endpoints: [
    {
      path: '/health',
      method: 'GET',
    },
    {
      path: '/json',
      method: 'GET',
    },
    {
      path: '/users/456',
      method: 'GET',
    },
    {
      path: '/posts',
      method: 'GET',
    },
  ],
}
