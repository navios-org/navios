import { BunControllerAdapterToken } from '@navios/adapter-bun'
import { Logger } from '@navios/core'
import { InjectableScope, InjectableType } from '@navios/di'
import { OtelSetupService, defineOtelTracingPlugin } from '@navios/otel'

import type { BunApplicationServiceInterface } from '@navios/adapter-bun'
import type { FullPluginContext, ModulesLoadedContext, StagedPluginDefinition } from '@navios/core'

import { TracedBunControllerAdapterService } from '../overrides/index.mjs'
import { BunOtelOptionsToken } from '../tokens/index.mjs'

import type { BunOtelPluginOptions } from '../interfaces/index.mjs'

/**
 * Pre-adapter-resolve plugin that registers the traced controller adapter.
 *
 * This runs before the adapter is resolved, allowing us to register
 * TracedBunControllerAdapterService with higher priority.
 */
class OtelBunPreAdapterPlugin {
  readonly name = '@navios/otel-bun:pre-adapter'
  readonly stage = 'pre:adapter-resolve' as const

  register(context: ModulesLoadedContext, options: BunOtelPluginOptions): void {
    const { container } = context

    // Register plugin options in container for TracedBunControllerAdapterService
    container.addInstance(BunOtelOptionsToken, options)

    // Only register traced adapter if HTTP auto-instrumentation is enabled (default: true)
    if (options.autoInstrument?.http !== false) {
      // Register TracedBunControllerAdapterService with high priority (100)
      // This overrides the default BunControllerAdapterService (priority 0)
      const registry = container.getRegistry()
      registry.set(
        BunControllerAdapterToken,
        InjectableScope.Singleton,
        TracedBunControllerAdapterService,
        InjectableType.Class,
        100, // Higher priority than default (0)
      )
    }
  }
}

/**
 * Post-modules-init plugin that initializes OpenTelemetry SDK.
 *
 * This runs after modules are initialized, when we have full context.
 */
class OtelBunPostModulesPlugin {
  readonly name = '@navios/otel-bun:post-modules'
  readonly stage = 'post:modules-init' as const

  async register(
    context: FullPluginContext<BunApplicationServiceInterface>,
    options: BunOtelPluginOptions,
  ): Promise<void> {
    const { container } = context
    const logger = await container.get(Logger, { context: 'OtelPlugin' })

    // Initialize OpenTelemetry SDK
    const setupService = await container.get(OtelSetupService)
    await setupService.initialize(options)

    logger.debug(`OpenTelemetry plugin registered for service: ${options.serviceName}`)
  }
}

/**
 * Creates OpenTelemetry plugins for Bun adapter.
 *
 * This function returns an array of staged plugins that integrate OpenTelemetry
 * tracing with your Navios application:
 *
 * 1. `pre:adapter-resolve` - Registers TracedBunControllerAdapterService
 *    with high priority when `autoInstrument.http` is enabled (default: true)
 * 2. `post:modules-init` - Initializes the OpenTelemetry SDK
 *
 * Features:
 * - Automatic HTTP request tracing with span creation
 * - W3C Trace Context propagation (traceparent/tracestate headers)
 * - Route-based span naming with controller/handler info
 * - Error recording and status codes
 * - Guard execution tracing (when autoInstrument.handlers is enabled)
 * - Configurable route exclusion patterns
 *
 * @param options - Plugin configuration options
 * @returns An array of staged plugin definitions
 *
 * @example
 * ```typescript
 * import { NaviosFactory } from '@navios/core'
 * import { defineBunEnvironment } from '@navios/adapter-bun'
 * import { defineOtelPlugin } from '@navios/otel-bun'
 *
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineBunEnvironment(),
 * })
 *
 * // Register all OTel plugins
 * for (const pluginDef of defineOtelPlugin({
 *   serviceName: 'my-bun-api',
 *   exporter: 'otlp',
 *   exporterOptions: {
 *     endpoint: 'http://localhost:4318/v1/traces',
 *   },
 *   autoInstrument: {
 *     http: true,     // Enable HTTP tracing (default)
 *     handlers: true, // Trace guard execution
 *   },
 *   ignoreRoutes: ['/health', '/metrics'],
 * })) {
 *   app.usePlugin(pluginDef)
 * }
 *
 * await app.listen({ port: 3000 })
 * ```
 */
export function defineOtelPlugin(
  options: BunOtelPluginOptions,
): [
  StagedPluginDefinition<'pre:adapter-resolve'>,
  StagedPluginDefinition<'pre:adapter-resolve', BunOtelPluginOptions>,
  StagedPluginDefinition<'post:modules-init', BunOtelPluginOptions, BunApplicationServiceInterface>,
] {
  return [
    defineOtelTracingPlugin({}),
    {
      plugin: new OtelBunPreAdapterPlugin(),
      options,
    },
    {
      plugin: new OtelBunPostModulesPlugin(),
      options,
    },
  ]
}

// Re-export the plugin classes for advanced usage
export { OtelBunPreAdapterPlugin, OtelBunPostModulesPlugin }
