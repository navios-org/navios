// Adapter-dependent slice of the defineOtelPlugin spec.
//
// These tests assert the high-priority registration of
// `TracedBunControllerAdapterService` into the di registry under the
// `BunControllerAdapterToken`. They genuinely need `@navios/adapter-bun`
// (the token) and `../overrides/index.mjs` (the traced adapter, which
// transitively imports adapter-bun).
//
// `@navios/adapter-bun` is still di-v1 (un-migrated until Task 8.8) and its
// module graph currently fails to load under di-v2 with
// `SyntaxError: Export named 'inject' not found in @navios/core`. So this
// FILE is expected to fail at module-load until Task 8.8 — a documented
// upstream baseline, NOT a regression from this change. It is split out of
// `define-otel-plugin.spec.mts` precisely so that the (adapter-free)
// integration / idempotency / option-storage tests can run TODAY.
import { BunControllerAdapterToken } from '@navios/adapter-bun'
import {
  Container,
  InjectableScope,
  InjectableType,
  Registry,
} from '@navios/di'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ModulesLoadedContext } from '@navios/core'

import { TracedBunControllerAdapterService } from '../overrides/index.mjs'
import { OtelBunPreAdapterPlugin } from '../plugin/define-otel-plugin.mjs'

import type { BunOtelPluginOptions } from '../interfaces/index.mjs'

describe('defineOtelPlugin (adapter-bun dependent)', () => {
  let container: Container
  let registry: Registry

  beforeEach(() => {
    registry = new Registry()
    container = new Container({ registry })
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('OtelBunPreAdapterPlugin traced-adapter registration', () => {
    it('should register TracedBunControllerAdapterService when autoInstrument.http is true', async () => {
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

      await plugin.register(context, options)

      const factoryRecord = container.internals.registry.get(BunControllerAdapterToken)
      expect(factoryRecord).toBeDefined()
      expect(factoryRecord.target).toBe(TracedBunControllerAdapterService)
      expect(factoryRecord.priority).toBe(100)
      expect(factoryRecord.scope).toBe(InjectableScope.Singleton)
      expect(factoryRecord.type).toBe(InjectableType.Class)
    })

    it('should register TracedBunControllerAdapterService when autoInstrument.http is undefined (default)', async () => {
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

      await plugin.register(context, options)

      const factoryRecord = container.internals.registry.get(BunControllerAdapterToken)
      expect(factoryRecord).toBeDefined()
      expect(factoryRecord.target).toBe(TracedBunControllerAdapterService)
    })

    it('should NOT register TracedBunControllerAdapterService when autoInstrument.http is false', async () => {
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

      await plugin.register(context, options)

      expect(container.internals.registry.has(BunControllerAdapterToken)).toBe(false)
    })

    it('should register with higher priority than default (100 > 0)', async () => {
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

      await plugin.register(context, options)

      const factoryRecord = container.internals.registry.get(BunControllerAdapterToken)
      expect(factoryRecord.target).toBe(TracedBunControllerAdapterService)
      expect(factoryRecord.priority).toBe(100)
    })
  })
})
