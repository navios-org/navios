import { describe, expect, it } from 'vitest'

import { defineOtelPlugin, OtelFastifyPlugin } from '../plugin/define-otel-plugin.mjs'

import type { FastifyOtelPluginOptions } from '../interfaces/index.mjs'

describe('defineOtelPlugin', () => {
  describe('plugin structure', () => {
    it('should return a plugin definition object', () => {
      const [, pluginDef] = defineOtelPlugin({
        serviceName: 'test-service',
        exporter: 'console',
      })

      expect(pluginDef).toBeDefined()
      expect(pluginDef.plugin).toBeDefined()
      expect(pluginDef.options).toBeDefined()
    })

    it('should return an OtelFastifyPlugin instance', () => {
      const [, pluginDef] = defineOtelPlugin({
        serviceName: 'test-service',
        exporter: 'console',
      })

      expect(pluginDef.plugin).toBeInstanceOf(OtelFastifyPlugin)
      expect(pluginDef.plugin.name).toBe('@navios/otel-fastify')
    })

    it('should pass options through to the plugin definition', () => {
      const options: FastifyOtelPluginOptions = {
        serviceName: 'test-service',
        exporter: 'otlp',
        exporterOptions: {
          endpoint: 'http://localhost:4318/v1/traces',
        },
        autoInstrument: {
          http: true,
          handlers: true,
        },
        ignoreRoutes: ['/health', '/metrics'],
      }

      const [, pluginDef] = defineOtelPlugin(options)

      expect(pluginDef.options).toBe(options)
    })
  })

  describe('OtelFastifyPlugin', () => {
    it('should have the correct name', () => {
      const plugin = new OtelFastifyPlugin()

      expect(plugin.name).toBe('@navios/otel-fastify')
    })

    it('should implement NaviosPlugin interface', () => {
      const plugin = new OtelFastifyPlugin()

      expect(plugin.name).toBeDefined()
      expect(typeof plugin.register).toBe('function')
    })
  })

  describe('options handling', () => {
    it('should accept minimal required options', () => {
      const [, pluginDef] = defineOtelPlugin({
        serviceName: 'minimal-service',
        exporter: 'none',
      })

      // @ts-expect-error - pluginDef is a StagedPluginDefinition
      expect(pluginDef.options.serviceName).toBe('minimal-service')
      // @ts-expect-error - pluginDef is a StagedPluginDefinition
      expect(pluginDef.options.exporter).toBe('none')
    })

    it('should accept full options with all fields', () => {
      const options: FastifyOtelPluginOptions = {
        serviceName: 'full-service',
        serviceVersion: '1.0.0',
        environment: 'test',
        exporter: 'otlp',
        exporterOptions: {
          endpoint: 'http://localhost:4318/v1/traces',
          headers: { 'X-Auth': 'token' },
        },
        autoInstrument: {
          http: true,
          handlers: true,
          guards: false,
        },
        metrics: {
          enabled: true,
          requestDuration: true,
          errorCount: true,
        },
        includeNaviosAttributes: true,
        sampling: {
          ratio: 0.5,
        },
        ignoreRoutes: ['/health', '/metrics', '/docs/*'],
        propagateContext: true,
      }

      const [, pluginDef] = defineOtelPlugin(options)

      expect(pluginDef.options).toEqual(options)
    })

    it('should accept ignoreRoutes with glob patterns', () => {
      const options: FastifyOtelPluginOptions = {
        serviceName: 'test-service',
        exporter: 'console',
        ignoreRoutes: ['/health', '/metrics', '/api/internal/*', '/docs/*'],
      }

      const [, pluginDef] = defineOtelPlugin(options)

      // @ts-expect-error - pluginDef is a StagedPluginDefinition
      expect(pluginDef.options.ignoreRoutes).toEqual([
        '/health',
        '/metrics',
        '/api/internal/*',
        '/docs/*',
      ])
    })
  })
})
