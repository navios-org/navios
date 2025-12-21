import type { BenchmarkConfig } from './types.js'

/**
 * Light Load Scenario
 *
 * Tests all endpoints with minimal concurrent connections.
 * Good for baseline performance without contention.
 */
export const lightLoadConfig: BenchmarkConfig = {
  name: 'light-load',
  description: 'All endpoints tested with 10 concurrent connections',
  duration: 30,
  connections: 10,
  pipelining: 1,
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
      path: '/users/123',
      method: 'GET',
    },
    {
      path: '/search?q=test&page=1&limit=10',
      method: 'GET',
    },
    {
      path: '/users',
      method: 'POST',
      body: {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      },
      headers: {
        'Content-Type': 'application/json',
      },
    },
    {
      path: '/posts',
      method: 'GET',
    },
    {
      path: '/admin/stats',
      method: 'GET',
    },
    {
      path: '/data/large',
      method: 'GET',
    },
  ],
}
