import type { BenchmarkConfig } from './types.js'

/**
 * Sustained Load Scenario
 *
 * Long-running test for memory leak detection.
 * Rotates through all endpoints over extended period.
 */
export const sustainedLoadConfig: BenchmarkConfig = {
  name: 'sustained-load',
  description: 'Memory stability test with 50 connections for 5 minutes',
  duration: 300, // 5 minutes
  connections: 50,
  pipelining: 5,
  warmup: 10,
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
      path: '/users/789',
      method: 'GET',
    },
    {
      path: '/search?q=benchmark&page=1&limit=20',
      method: 'GET',
    },
    {
      path: '/users',
      method: 'POST',
      body: {
        name: 'Test User',
        email: 'test@example.com',
        age: 25,
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

export const MEMORY_SAMPLE_INTERVAL = 5000 // 5 seconds
