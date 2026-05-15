import { Logger } from '@navios/core'
import { InjectableScope, InjectableType } from '@navios/di'
import { defineOtelTracingPlugin, OtelSetupService } from '@navios/otel'

import type { BunApplicationServiceInterface } from '@navios/adapter-bun'
import type { FullPluginContext, ModulesLoadedContext, StagedPluginDefinition } from '@navios/core'

import { BunOtelOptionsToken } from '../tokens/index.mjs'

import type { BunOtelPluginOptions } from '../interfaces/index.mjs'

/**
 * Pre-adapter-resolve plugin that registers the traced controller adapter
 * and wires the di container `@Traced` middleware.
 *
 * This is a `@navios/core` APP plugin (StagedPluginDefinition). It runs
 * before the adapter is resolved, so it:
 *
 * 1. Stores the plugin options on the container.
 * 2. Registers the `@navios/di` CONTAINER tracing plugin via
 *    `container.use(defineOtelTracingPlugin({}))` so every subsequently
 *    resolved `@Traced`/`@Traceable` service is transparently wrapped with
 *    the OpenTelemetry tracing proxy.
 * 3. Registers `TracedBunControllerAdapterService` with higher priority
 *    (when `autoInstrument.http` is enabled, default: true).
 *
 * See the inline comment in `register()` for the two-plugin-systems
 * rationale behind step 2.
 */
class OtelBunPreAdapterPlugin {
  readonly name = '@navios/otel-bun:pre-adapter'
  readonly stage = 'pre:adapter-resolve' as const

  async register(context: ModulesLoadedContext, options: BunOtelPluginOptions): Promise<void> {
    const { container } = context

    // Wire the `@navios/di` CONTAINER plugin that transparently wraps
    // `@Traced`/`@Traceable` services with the OpenTelemetry tracing proxy.
    //
    // There are TWO distinct plugin systems at play:
    //   1. The `@navios/core` APP plugin system (StagedPluginDefinition,
    //      app.usePlugin, stages like `pre:adapter-resolve`). This class is
    //      one of those staged app plugins.
    //   2. The `@navios/di` CONTAINER plugin system (definePlugin/middleware,
    //      registered via `new Container({ plugins })` OR post-construction
    //      via `container.use(plugin)`).
    //
    // After the `@navios/otel` di-v2 migration, `defineOtelTracingPlugin()`
    // is a di CONTAINER plugin (resolution middleware), NOT a core staged
    // app plugin — so it cannot live in `defineOtelPlugin`'s returned staged
    // array. Instead we register it here via `container.use()`. This stage
    // (`pre:adapter-resolve`) runs BEFORE controllers/guards/adapters are
    // resolved, and `container.use()` applies to every service resolved
    // AFTER the call (the di middleware list is re-read fresh on each
    // `.get()`), so every `@Traced`/`@Traceable` service resolved afterward
    // gets the tracing proxy — preserving v1 behavior with the correct v2
    // system.
    //
    // Guarded invariant: this whole pre-adapter wiring is applied AT MOST
    // ONCE per container. The di `PluginRegistry.register` is an
    // unconditional `push` (no dedup) and `defineOtelTracingPlugin()` mints
    // a fresh `'otel-tracing'` plugin each call, so if `register()` runs
    // more than once on the same container (consumer calls
    // `defineOtelPlugin` twice, registers the pre-adapter plugin from two
    // modules, or a second `app.init()`) the tracing middleware would stack
    // N-deep → N nested proxies → N child spans per traced method call
    // (silent, hard to diagnose); the `addInstance(BunOtelOptionsToken)`
    // below would also throw "Instance already stored". We use the presence
    // of an already-registered `'otel-tracing'` di plugin (introspected via
    // the container's di plugin registry) as the sentinel that this wiring
    // already ran, and short-circuit the whole `register()` if so.
    const alreadyRegistered = container.internals.pluginRegistry
      .getAll()
      .some((plugin) => plugin.name === 'otel-tracing')
    if (alreadyRegistered) {
      return
    }

    // Register plugin options in container for TracedBunControllerAdapterService
    container.addInstance(BunOtelOptionsToken, options)

    // `{}` is intentional: the di tracing plugin
    // (`@navios/otel`'s `otel-tracing.plugin.mts`) does not consume
    // options by design. Bun OTEL options reach the HTTP layer via
    // `BunOtelOptionsToken` (see `addInstance` above), NOT the di
    // middleware — so nothing is dropped here. This matches v1 behavior.
    container.use(defineOtelTracingPlugin({}))

    // Only register traced adapter if HTTP auto-instrumentation is enabled (default: true)
    if (options.autoInstrument?.http !== false) {
      // Lazy `import()` (not a top-level import) so merely loading this
      // module does NOT eagerly pull `@navios/adapter-bun`. adapter-bun is
      // still di-v1 (un-migrated until Task 8.8) and its module graph
      // currently fails to load under di-v2; deferring the import to the
      // branch that actually needs it keeps `defineOtelPlugin` /
      // `OtelBunPreAdapterPlugin` importable (and thus the
      // tracing-middleware + option-storage tests runnable) before 8.8,
      // without changing any production wiring behavior.
      const { BunControllerAdapterToken } = await import('@navios/adapter-bun')
      const { TracedBunControllerAdapterService } = await import('../overrides/index.mjs')

      // Register TracedBunControllerAdapterService with high priority (100)
      // This overrides the default BunControllerAdapterService (priority 0)
      const registry = container.internals.registry
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
 * This function returns exactly TWO `@navios/core` staged APP plugins that
 * integrate OpenTelemetry tracing with your Navios application:
 *
 * 1. `pre:adapter-resolve` (`OtelBunPreAdapterPlugin`) - stores plugin
 *    options, registers the `@navios/di` CONTAINER `@Traced` middleware via
 *    `container.use(defineOtelTracingPlugin({}))`, and registers
 *    `TracedBunControllerAdapterService` with high priority when
 *    `autoInstrument.http` is enabled (default: true).
 * 2. `post:modules-init` (`OtelBunPostModulesPlugin`) - Initializes the
 *    OpenTelemetry SDK.
 *
 * Note: the di container `@Traced` tracing middleware is NOT a returned
 * element. After the `@navios/otel` di-v2 migration it is a `@navios/di`
 * CONTAINER plugin (not a core staged app plugin), so it is registered
 * imperatively via `container.use()` from `OtelBunPreAdapterPlugin.register`
 * rather than being added to this staged array.
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
 * @returns A 2-tuple of staged plugin definitions
 *   (`pre:adapter-resolve` then `post:modules-init`)
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
  StagedPluginDefinition<'pre:adapter-resolve', BunOtelPluginOptions>,
  StagedPluginDefinition<'post:modules-init', BunOtelPluginOptions, BunApplicationServiceInterface>,
] {
  return [
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
