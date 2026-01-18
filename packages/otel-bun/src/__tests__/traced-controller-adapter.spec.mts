import { TestContainer } from '@navios/di/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BunOtelOptionsToken } from '../tokens/index.mjs'

import type { BunOtelPluginOptions } from '../interfaces/index.mjs'

/**
 * Since TracedBunControllerAdapterService has many dependencies,
 * we test the route ignoring logic by extracting and testing the pattern matching directly.
 * The actual service integration is tested via e2e/integration tests.
 */
describe('TracedBunControllerAdapterService', () => {
  describe('route ignoring patterns', () => {
    /**
     * Tests the route matching logic that determines if a route should be traced.
     * This mirrors the shouldTraceRoute method in TracedBunControllerAdapterService.
     */
    function shouldTraceRoute(route: string, ignoreRoutes: string[] = []): boolean {
      return !ignoreRoutes.some((pattern) => {
        if (pattern.includes('*')) {
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
          return regex.test(route)
        }
        return route === pattern
      })
    }

    it('should trace all routes when ignoreRoutes is empty', () => {
      expect(shouldTraceRoute('/users', [])).toBe(true)
      expect(shouldTraceRoute('/health', [])).toBe(true)
      expect(shouldTraceRoute('/api/v1/data', [])).toBe(true)
    })

    it('should not trace exact match routes', () => {
      const ignoreRoutes = ['/health', '/metrics']

      expect(shouldTraceRoute('/health', ignoreRoutes)).toBe(false)
      expect(shouldTraceRoute('/metrics', ignoreRoutes)).toBe(false)
      expect(shouldTraceRoute('/users', ignoreRoutes)).toBe(true)
    })

    it('should support wildcard patterns with *', () => {
      const ignoreRoutes = ['/internal/*']

      expect(shouldTraceRoute('/internal/health', ignoreRoutes)).toBe(false)
      expect(shouldTraceRoute('/internal/metrics', ignoreRoutes)).toBe(false)
      expect(shouldTraceRoute('/internal/deep/nested', ignoreRoutes)).toBe(false)
      expect(shouldTraceRoute('/users', ignoreRoutes)).toBe(true)
      expect(shouldTraceRoute('/api/internal', ignoreRoutes)).toBe(true)
    })

    it('should support multiple wildcards', () => {
      const ignoreRoutes = ['/api/*/internal/*']

      expect(shouldTraceRoute('/api/v1/internal/health', ignoreRoutes)).toBe(false)
      expect(shouldTraceRoute('/api/v2/internal/metrics', ignoreRoutes)).toBe(false)
      expect(shouldTraceRoute('/api/v1/users', ignoreRoutes)).toBe(true)
    })

    it('should handle mixed exact and wildcard patterns', () => {
      const ignoreRoutes = ['/health', '/metrics', '/internal/*', '/api/*/debug']

      expect(shouldTraceRoute('/health', ignoreRoutes)).toBe(false)
      expect(shouldTraceRoute('/metrics', ignoreRoutes)).toBe(false)
      expect(shouldTraceRoute('/internal/status', ignoreRoutes)).toBe(false)
      expect(shouldTraceRoute('/api/v1/debug', ignoreRoutes)).toBe(false)
      expect(shouldTraceRoute('/users', ignoreRoutes)).toBe(true)
      expect(shouldTraceRoute('/api/v1/users', ignoreRoutes)).toBe(true)
    })

    it('should not match partial routes without wildcards', () => {
      const ignoreRoutes = ['/health']

      expect(shouldTraceRoute('/health', ignoreRoutes)).toBe(false)
      expect(shouldTraceRoute('/health/check', ignoreRoutes)).toBe(true)
      expect(shouldTraceRoute('/healthcheck', ignoreRoutes)).toBe(true)
    })

    it('should match routes with trailing wildcards', () => {
      const ignoreRoutes = ['/health*']

      expect(shouldTraceRoute('/health', ignoreRoutes)).toBe(false)
      expect(shouldTraceRoute('/health/check', ignoreRoutes)).toBe(false)
      expect(shouldTraceRoute('/healthcheck', ignoreRoutes)).toBe(false)
    })
  })

  describe('plugin options configuration', () => {
    let container: TestContainer

    beforeEach(() => {
      container = new TestContainer()
    })

    afterEach(async () => {
      await container.clear()
    })

    it('should store ignoreRoutes in plugin options', async () => {
      const options: BunOtelPluginOptions = {
        serviceName: 'test-service',
        exporter: 'console',
        ignoreRoutes: ['/health', '/metrics', '/internal/*'],
      }

      container.bind(BunOtelOptionsToken).toValue(options)

      const storedOptions = await container.get(BunOtelOptionsToken)
      expect(storedOptions.ignoreRoutes).toEqual(['/health', '/metrics', '/internal/*'])
    })

    it('should default to empty ignoreRoutes when not provided', async () => {
      const options: BunOtelPluginOptions = {
        serviceName: 'test-service',
        exporter: 'console',
      }

      container.bind(BunOtelOptionsToken).toValue(options)

      const storedOptions = await container.get(BunOtelOptionsToken)
      expect(storedOptions.ignoreRoutes ?? []).toEqual([])
    })

    it('should store autoInstrument options', async () => {
      const options: BunOtelPluginOptions = {
        serviceName: 'test-service',
        exporter: 'console',
        autoInstrument: {
          http: true,
          handlers: true,
        },
      }

      container.bind(BunOtelOptionsToken).toValue(options)

      const storedOptions = await container.get(BunOtelOptionsToken)
      expect(storedOptions.autoInstrument).toEqual({
        http: true,
        handlers: true,
      })
    })
  })
})
