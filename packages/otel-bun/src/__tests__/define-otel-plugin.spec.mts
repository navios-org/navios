// Adapter-FREE slice of the defineOtelPlugin spec.
//
// This file deliberately avoids any top-level import that transitively
// pulls `@navios/adapter-bun` (still di-v1 / un-migrated until Task 8.8 and
// currently failing to module-load under di-v2). The adapter-dependent
// traced-adapter-registration tests live in
// `define-otel-plugin.adapter.spec.mts`. Everything here — plugin
// structure, the di `@Traced` middleware integration, the idempotency
// guard, and option storage — runs and passes TODAY, before Task 8.8.
//
// `OtelBunPreAdapterPlugin.register` only `await import('@navios/adapter-bun')`
// inside its `autoInstrument.http !== false` branch, so as long as these
// tests use `autoInstrument: { http: false }` the adapter graph is never
// loaded.
import {
  Container,
  Injectable,
} from '@navios/di'
import { SpanFactoryService, Traced } from '@navios/otel'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ModulesLoadedContext } from '@navios/core'

import {
  defineOtelPlugin,
  OtelBunPostModulesPlugin,
  OtelBunPreAdapterPlugin,
} from '../plugin/define-otel-plugin.mjs'
import { BunOtelOptionsToken } from '../tokens/index.mjs'

import type { BunOtelPluginOptions } from '../interfaces/index.mjs'

describe('defineOtelPlugin', () => {
  let container: Container

  beforeEach(() => {
    // Use the default (global) registry — mirroring @navios/otel's own
    // otel-tracing.plugin.spec — because the behavioral integration /
    // idempotency tests resolve @navios/otel's globally-@Injectable()
    // SpanFactoryService through this container. A fresh isolated
    // `new Registry()` would have no factory for it. Per-test @Injectable
    // fixtures are still defined inside their `it()` blocks to avoid
    // cross-test pollution.
    container = new Container()
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

      await plugin.register(context, options)

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

      await plugin.register(context, options)

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

    it('registers the di @Traced middleware even when autoInstrument.http is false', async () => {
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

      await plugin.register(context, options)

      // The @Traced middleware wiring is independent of HTTP
      // auto-instrumentation; it is always registered.
      expect(useSpy).toHaveBeenCalledTimes(1)
      expect(useSpy.mock.calls[0]![0].name).toBe('otel-tracing')
    })

    // Regression test for the idempotency guard (Fix 1).
    //
    // `@navios/di`'s `PluginRegistry.register` is an unconditional `push`
    // (no dedup) and `defineOtelTracingPlugin()` mints a fresh
    // `'otel-tracing'` plugin per call. Without the guard, calling
    // `register()` twice on the same container stacks the tracing
    // middleware twice → two nested proxies → TWO `createChildSpan` calls
    // for a single traced-method invocation. The guard
    // (`pluginRegistry.getAll().some(p => p.name === 'otel-tracing')`)
    // makes the second `register()` a no-op for the di plugin.
    //
    // This test would FAIL (createChildSpan called 2x, useSpy called 2x)
    // if the guard in OtelBunPreAdapterPlugin.register were removed.
    it('does not stack the di @Traced middleware when register() runs twice (idempotent)', async () => {
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

      // Two registrations on the SAME container (consumer double-registers
      // the pre-adapter plugin / a second app.init()).
      await plugin.register(context, options)
      await plugin.register(context, options)

      // Structural: the second register() must NOT register a second
      // di 'otel-tracing' plugin.
      expect(useSpy).toHaveBeenCalledTimes(1)
      expect(useSpy.mock.calls[0]![0].name).toBe('otel-tracing')

      // And the registry holds exactly one 'otel-tracing' plugin.
      const tracingPlugins = container.internals.pluginRegistry
        .getAll()
        .filter((p) => p.name === 'otel-tracing')
      expect(tracingPlugins).toHaveLength(1)

      // Behavioral: a single traced-method invocation must create EXACTLY
      // ONE child span. Stacked (N-deep) tracing proxies would yield N.
      const spanFactory = await container.get(SpanFactoryService)
      const createChildSpan = vi.spyOn(spanFactory, 'createChildSpan')

      @Injectable()
      @Traced({ name: 'traced-once' })
      class TracedOnce {
        compute(value: number) {
          return value + 1
        }
      }

      const service = await container.get(TracedOnce)

      expect(service.compute(41)).toBe(42)
      expect(createChildSpan).toHaveBeenCalledTimes(1)
      expect(createChildSpan).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'traced-once.compute' }),
      )
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
