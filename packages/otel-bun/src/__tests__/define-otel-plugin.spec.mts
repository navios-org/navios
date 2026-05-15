import { BunControllerAdapterToken } from '@navios/adapter-bun'
import {
  Container,
  Injectable,
  InjectableScope,
  InjectableType,
  Registry,
} from '@navios/di'
import { SpanFactoryService, Traced } from '@navios/otel'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ModulesLoadedContext } from '@navios/core'

import { TracedBunControllerAdapterService } from '../overrides/index.mjs'
import {
  defineOtelPlugin,
  OtelBunPostModulesPlugin,
  OtelBunPreAdapterPlugin,
} from '../plugin/define-otel-plugin.mjs'
import { BunOtelOptionsToken } from '../tokens/index.mjs'

import type { BunOtelPluginOptions } from '../interfaces/index.mjs'

describe('defineOtelPlugin', () => {
  let container: Container
  let registry: Registry

  beforeEach(() => {
    registry = new Registry()
    container = new Container({ registry })
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('plugin structure', () => {
    it('should return a 2-tuple of staged plugins (di @Traced middleware is NOT an element)', () => {
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
        autoInstrument: { http: true },
      }

      const context: ModulesLoadedContext = {
        container,
        modules: new Map(),
        moduleLoader: {} as any,
      }

      plugin.register(context, options)

      const factoryRecord = container.internals.registry.get(BunControllerAdapterToken)
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

      const factoryRecord = container.internals.registry.get(BunControllerAdapterToken)
      expect(factoryRecord).toBeDefined()
      expect(factoryRecord.target).toBe(TracedBunControllerAdapterService)
    })

    it('should NOT register TracedBunControllerAdapterService when autoInstrument.http is false', () => {
      const plugin = new OtelBunPreAdapterPlugin()
      const options: BunOtelPluginOptions = {
        serviceName: 'test-service',
        exporter: 'console',
        autoInstrument: { http: false },
      }

      const context: ModulesLoadedContext = {
        container,
        modules: new Map(),
        moduleLoader: {} as any,
      }

      plugin.register(context, options)

      expect(container.internals.registry.has(BunControllerAdapterToken)).toBe(false)
    })

    it('should register with higher priority than default (100 > 0)', () => {
      const plugin = new OtelBunPreAdapterPlugin()
      const options: BunOtelPluginOptions = {
        serviceName: 'test-service',
        exporter: 'console',
      }

      // First, register a "default" adapter with priority 0
      container.internals.registry.set(
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

      const factoryRecord = container.internals.registry.get(BunControllerAdapterToken)
      expect(factoryRecord.target).toBe(TracedBunControllerAdapterService)
      expect(factoryRecord.priority).toBe(100)
    })

    it('should store plugin options in container', async () => {
      const plugin = new OtelBunPreAdapterPlugin()
      const options: BunOtelPluginOptions = {
        serviceName: 'test-service',
        exporter: 'otlp',
        ignoreRoutes: ['/health', '/metrics'],
        // Skip traced-adapter registration so this case does not depend on
        // the (still di-v1, until Task 8.8) @navios/adapter-bun token.
        autoInstrument: { http: false },
      }

      const context: ModulesLoadedContext = {
        container,
        modules: new Map(),
        moduleLoader: {} as any,
      }

      plugin.register(context, options)

      const storedOptions = await container.get(BunOtelOptionsToken)
      expect(storedOptions).toBe(options)
    })

    // Core integration assertion for the v1 -> v2 migration:
    //
    // In v1 the OTel di tracing was a `pre:adapter-resolve` *core app*
    // plugin element of the returned array. After the @navios/otel di-v2
    // migration `defineOtelTracingPlugin()` is a @navios/di *container*
    // plugin (resolution middleware), so it can no longer be a staged
    // array element. `OtelBunPreAdapterPlugin.register` must instead wire
    // it imperatively via `container.use()`. This test proves that wiring
    // both structurally (the spy) and behaviorally (a @Traced service
    // resolved from that same container afterwards comes back as the
    // tracing proxy, detected via SpanFactoryService.createChildSpan -
    // the same technique @navios/otel's plugin spec uses).
    it('registers the di @Traced middleware on the container via container.use()', async () => {
      const plugin = new OtelBunPreAdapterPlugin()
      const options: BunOtelPluginOptions = {
        serviceName: 'test-service',
        exporter: 'console',
        autoInstrument: { http: false },
      }

      const useSpy = vi.spyOn(container, 'use')

      const context: ModulesLoadedContext = {
        container,
        modules: new Map(),
        moduleLoader: {} as any,
      }

      plugin.register(context, options)

      // Structural: the di container plugin was registered exactly once.
      expect(useSpy).toHaveBeenCalledTimes(1)
      const registeredPlugin = useSpy.mock.calls[0]![0]
      expect(registeredPlugin.name).toBe('otel-tracing')
      expect(typeof registeredPlugin.middleware).toBe('function')

      // Behavioral: a @Traced service resolved AFTER the use() call must
      // come back wrapped in the tracing proxy. An unwrapped instance
      // would never call into SpanFactoryService.
      const spanFactory = await container.get(SpanFactoryService)
      const createChildSpan = vi.spyOn(spanFactory, 'createChildSpan')

      @Injectable()
      @Traced({ name: 'traced-after-use' })
      class TracedAfterUse {
        compute(value: number) {
          return value + 1
        }
      }

      const service = await container.get(TracedAfterUse)

      // Transparency: the proxy forwards to the real implementation.
      expect(service.compute(41)).toBe(42)

      // Proof it is the tracing proxy (not the raw instance).
      expect(createChildSpan).toHaveBeenCalledTimes(1)
      expect(createChildSpan).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'traced-after-use.compute' }),
      )
    })

    it('registers the di @Traced middleware even when autoInstrument.http is false', () => {
      const plugin = new OtelBunPreAdapterPlugin()
      const options: BunOtelPluginOptions = {
        serviceName: 'test-service',
        exporter: 'console',
        autoInstrument: { http: false },
      }

      const useSpy = vi.spyOn(container, 'use')

      const context: ModulesLoadedContext = {
        container,
        modules: new Map(),
        moduleLoader: {} as any,
      }

      plugin.register(context, options)

      // The @Traced middleware wiring is independent of HTTP
      // auto-instrumentation; it is always registered.
      expect(useSpy).toHaveBeenCalledTimes(1)
      expect(useSpy.mock.calls[0]![0].name).toBe('otel-tracing')
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

      const [preAdapter, postModules] = plugins

      // These should compile without errors
      const _preAdapterStage: 'pre:adapter-resolve' = preAdapter.plugin.stage
      const _postModulesStage: 'post:modules-init' = postModules.plugin.stage

      expect(_preAdapterStage).toBe('pre:adapter-resolve')
      expect(_postModulesStage).toBe('post:modules-init')
    })
  })
})
