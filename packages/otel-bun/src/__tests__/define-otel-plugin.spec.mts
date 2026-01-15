import type { ModulesLoadedContext } from '@navios/core'

import { BunControllerAdapterToken } from '@navios/adapter-bun'
import { Container, Registry } from '@navios/di'
import { InjectableScope, InjectableType } from '@navios/di'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { BunOtelPluginOptions } from '../interfaces/index.mjs'

import {
  defineOtelPlugin,
  OtelBunPreAdapterPlugin,
  OtelBunPostModulesPlugin,
} from '../plugin/define-otel-plugin.mjs'
import { TracedBunControllerAdapterService } from '../overrides/index.mjs'
import { BunOtelOptionsToken } from '../tokens/index.mjs'

describe('defineOtelPlugin', () => {
  let container: Container
  let registry: Registry

  beforeEach(() => {
    registry = new Registry()
    container = new Container(registry)
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('plugin structure', () => {
    it('should return an array of two staged plugins', () => {
      const plugins = defineOtelPlugin({
        serviceName: 'test-service',
        exporter: 'console',
      })

      expect(plugins).toHaveLength(2)
      expect(Array.isArray(plugins)).toBe(true)
    })

    it('should return pre:adapter-resolve plugin as first element', () => {
      const plugins = defineOtelPlugin({
        serviceName: 'test-service',
        exporter: 'console',
      })

      const [preAdapterPlugin] = plugins
      expect(preAdapterPlugin.plugin.name).toBe('@navios/otel-bun:pre-adapter')
      expect(preAdapterPlugin.plugin.stage).toBe('pre:adapter-resolve')
    })

    it('should return post:modules-init plugin as second element', () => {
      const plugins = defineOtelPlugin({
        serviceName: 'test-service',
        exporter: 'console',
      })

      const [, postModulesPlugin] = plugins
      expect(postModulesPlugin.plugin.name).toBe('@navios/otel-bun:post-modules')
      expect(postModulesPlugin.plugin.stage).toBe('post:modules-init')
    })

    it('should pass options to both plugins', () => {
      const options: BunOtelPluginOptions = {
        serviceName: 'test-service',
        exporter: 'otlp',
        exporterOptions: {
          endpoint: 'http://localhost:4318/v1/traces',
        },
        autoInstrument: {
          http: true,
          handlers: true,
        },
        ignoreRoutes: ['/health'],
      }

      const plugins = defineOtelPlugin(options)

      expect(plugins[0].options).toBe(options)
      expect(plugins[1].options).toBe(options)
    })
  })

  describe('OtelBunPreAdapterPlugin', () => {
    it('should register TracedBunControllerAdapterService when autoInstrument.http is true', () => {
      const plugin = new OtelBunPreAdapterPlugin()
      const options: BunOtelPluginOptions = {
        serviceName: 'test-service',
        exporter: 'console',
        autoInstrument: {
          http: true,
        },
      }

      const context: ModulesLoadedContext = {
        container,
        modules: new Map(),
        moduleLoader: {} as any,
      }

      plugin.register(context, options)

      // Verify TracedBunControllerAdapterService is registered
      const factoryRecord = registry.get(BunControllerAdapterToken)
      expect(factoryRecord).toBeDefined()
      expect(factoryRecord.target).toBe(TracedBunControllerAdapterService)
      expect(factoryRecord.priority).toBe(100)
      expect(factoryRecord.scope).toBe(InjectableScope.Singleton)
      expect(factoryRecord.type).toBe(InjectableType.Class)
    })

    it('should register TracedBunControllerAdapterService when autoInstrument.http is undefined (default)', () => {
      const plugin = new OtelBunPreAdapterPlugin()
      const options: BunOtelPluginOptions = {
        serviceName: 'test-service',
        exporter: 'console',
        // autoInstrument not specified - defaults to http: true
      }

      const context: ModulesLoadedContext = {
        container,
        modules: new Map(),
        moduleLoader: {} as any,
      }

      plugin.register(context, options)

      // Verify TracedBunControllerAdapterService is registered
      const factoryRecord = registry.get(BunControllerAdapterToken)
      expect(factoryRecord).toBeDefined()
      expect(factoryRecord.target).toBe(TracedBunControllerAdapterService)
    })

    it('should NOT register TracedBunControllerAdapterService when autoInstrument.http is false', () => {
      const plugin = new OtelBunPreAdapterPlugin()
      const options: BunOtelPluginOptions = {
        serviceName: 'test-service',
        exporter: 'console',
        autoInstrument: {
          http: false,
        },
      }

      const context: ModulesLoadedContext = {
        container,
        modules: new Map(),
        moduleLoader: {} as any,
      }

      plugin.register(context, options)

      // Verify TracedBunControllerAdapterService is NOT registered
      expect(registry.has(BunControllerAdapterToken)).toBe(false)
    })

    it('should store plugin options in container', async () => {
      const plugin = new OtelBunPreAdapterPlugin()
      const options: BunOtelPluginOptions = {
        serviceName: 'test-service',
        exporter: 'otlp',
        ignoreRoutes: ['/health', '/metrics'],
      }

      const context: ModulesLoadedContext = {
        container,
        modules: new Map(),
        moduleLoader: {} as any,
      }

      plugin.register(context, options)

      // Verify options are stored in container
      const storedOptions = await container.get(BunOtelOptionsToken)
      expect(storedOptions).toBe(options)
    })

    it('should register with higher priority than default (100 > 0)', () => {
      const plugin = new OtelBunPreAdapterPlugin()
      const options: BunOtelPluginOptions = {
        serviceName: 'test-service',
        exporter: 'console',
      }

      // First, register a "default" adapter with priority 0
      registry.set(
        BunControllerAdapterToken,
        InjectableScope.Singleton,
        class DefaultAdapter {} as any,
        InjectableType.Class,
        0,
      )

      const context: ModulesLoadedContext = {
        container,
        modules: new Map(),
        moduleLoader: {} as any,
      }

      plugin.register(context, options)

      // Verify TracedBunControllerAdapterService has higher priority
      const factoryRecord = registry.get(BunControllerAdapterToken)
      expect(factoryRecord.target).toBe(TracedBunControllerAdapterService)
      expect(factoryRecord.priority).toBe(100)
    })
  })

  describe('OtelBunPostModulesPlugin', () => {
    it('should have correct name and stage', () => {
      const plugin = new OtelBunPostModulesPlugin()

      expect(plugin.name).toBe('@navios/otel-bun:post-modules')
      expect(plugin.stage).toBe('post:modules-init')
    })
  })

  describe('type safety', () => {
    it('should have correct return type for defineOtelPlugin', () => {
      const plugins = defineOtelPlugin({
        serviceName: 'test-service',
        exporter: 'console',
      })

      // Type assertion to verify return type structure
      const [preAdapter, postModules] = plugins

      // These should compile without errors
      const _preAdapterStage: 'pre:adapter-resolve' = preAdapter.plugin.stage
      const _postModulesStage: 'post:modules-init' = postModules.plugin.stage

      expect(_preAdapterStage).toBe('pre:adapter-resolve')
      expect(_postModulesStage).toBe('post:modules-init')
    })
  })
})
