import { Logger } from '@navios/core'
import {
  OtelConfigToken,
  OtelSetupService,
  SpanFactoryService,
  TraceContextService,
  defineOtelTracingPlugin,
} from '@navios/otel'

import type { FastifyApplicationServiceInterface } from '@navios/adapter-fastify'
import type {
  ModulesLoadedContext,
  NaviosPlugin,
  PluginContext,
  PluginDefinition,
  StagedPluginDefinition,
} from '@navios/core'
import type { FastifyInstance } from 'fastify'

import { createOnErrorHook, createOnRequestHook, createOnResponseHook } from '../hooks/index.mjs'

import type { FastifyOtelPluginOptions } from '../interfaces/index.mjs'

/**
 * Pre-adapter-resolve plugin that wires the di container `@Traced`
 * middleware.
 *
 * This is a `@navios/core` APP plugin (StagedPluginDefinition). It runs
 * before the adapter is resolved, so it registers the `@navios/di`
 * CONTAINER tracing plugin via
 * `container.use(defineOtelTracingPlugin({}))` so every subsequently
 * resolved `@Traced`/`@Traceable` service is transparently wrapped with
 * the OpenTelemetry tracing proxy.
 *
 * See the inline comment in `register()` for the two-plugin-systems
 * rationale.
 */
class OtelFastifyPreAdapterPlugin {
  readonly name = '@navios/otel-fastify:pre-adapter'
  readonly stage = 'pre:adapter-resolve' as const

  async register(context: ModulesLoadedContext, _options?: FastifyOtelPluginOptions): Promise<void> {
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
    // app plugin — so it cannot live in `defineOtelPlugin`'s returned plugin
    // array. Instead we register it here via `container.use()`. This stage
    // (`pre:adapter-resolve`) runs BEFORE controllers/guards/adapters are
    // resolved (`OtelFastifyPlugin` runs at the LATE `post:modules-init`
    // stage — too late, singleton `@Traced` services may already be
    // resolved during adapter-setup/modules-init), and `container.use()`
    // applies to every service resolved AFTER the call (the di middleware
    // list is re-read fresh on each `.get()`), so every `@Traced`/
    // `@Traceable` service resolved afterward gets the tracing proxy —
    // preserving v1 behavior with the correct v2 system.
    //
    // Guarded invariant: this pre-adapter wiring is applied AT MOST ONCE
    // per container. The di `PluginRegistry.register` is an unconditional
    // `push` (no dedup) and `defineOtelTracingPlugin()` mints a fresh
    // `'otel-tracing'` plugin each call, so if `register()` runs more than
    // once on the same container (consumer calls `defineOtelPlugin` twice,
    // registers the pre-adapter plugin from two modules, or a second
    // `app.init()`) the tracing middleware would stack N-deep → N nested
    // proxies → N child spans per traced method call (silent, hard to
    // diagnose). We use the presence of an already-registered
    // `'otel-tracing'` di plugin (introspected via the container's di plugin
    // registry) as the sentinel that this wiring already ran, and
    // short-circuit if so.
    const alreadyRegistered = container.internals.pluginRegistry
      .getAll()
      .some((plugin) => plugin.name === 'otel-tracing')
    if (alreadyRegistered) {
      return
    }

    // `{}` is intentional: the di tracing plugin
    // (`@navios/otel`'s `otel-tracing.plugin.mts`) does not consume options
    // by design. Fastify OTEL options reach the HTTP layer via the Fastify
    // hooks registered by `OtelFastifyPlugin`, NOT the di middleware — so
    // nothing is dropped here. This matches v1 behavior.
    container.use(defineOtelTracingPlugin({}))
  }
}

/**
 * OpenTelemetry plugin for Fastify adapter.
 *
 * This is a legacy `NaviosPlugin` (maps to the `post:modules-init` stage).
 * It runs after modules are initialized, when the resolved adapter is
 * available. It initializes the OpenTelemetry SDK and registers the
 * Fastify request/response/error/close hooks.
 */
export class OtelFastifyPlugin implements NaviosPlugin<
  FastifyOtelPluginOptions,
  FastifyApplicationServiceInterface
> {
  readonly name = '@navios/otel-fastify'

  async register(
    context: PluginContext<FastifyApplicationServiceInterface>,
    options: FastifyOtelPluginOptions,
  ): Promise<void> {
    const { container, adapter } = context
    const logger = await container.get(Logger, { context: 'OtelPlugin' })

    // Initialize OpenTelemetry
    const setupService = await container.get(OtelSetupService)
    await setupService.initialize(options)

    // Get services for hooks
    const traceContext = await container.get(TraceContextService)
    const spanFactory = await container.get(SpanFactoryService)

    // Get resolved config from setup service
    const config = await container.get(OtelConfigToken)

    // Get Fastify instance
    const fastify = adapter.getServer() as FastifyInstance

    // Register hooks
    if (options.autoInstrument?.http !== false) {
      fastify.addHook('onRequest', createOnRequestHook(traceContext, spanFactory, config, options))

      fastify.addHook('onResponse', createOnResponseHook(spanFactory))

      fastify.addHook('onError', createOnErrorHook(spanFactory))
    }

    // Register shutdown hook
    fastify.addHook('onClose', async () => {
      logger.debug('Shutting down OpenTelemetry')
      await setupService.shutdown()
    })

    logger.debug(`OpenTelemetry plugin registered for service: ${options.serviceName}`)
  }
}

/**
 * Creates OpenTelemetry plugins for the Fastify adapter.
 *
 * This function returns exactly TWO `@navios/core` plugin definitions that
 * integrate OpenTelemetry tracing with your Navios application:
 *
 * 1. `pre:adapter-resolve` (`OtelFastifyPreAdapterPlugin`) - registers the
 *    `@navios/di` CONTAINER `@Traced` middleware via
 *    `container.use(defineOtelTracingPlugin({}))` so every subsequently
 *    resolved `@Traced`/`@Traceable` service is wrapped with the tracing
 *    proxy (guarded so it is wired at most once per container).
 * 2. `OtelFastifyPlugin` - a legacy `NaviosPlugin` (maps to
 *    `post:modules-init`) that initializes the OpenTelemetry SDK and
 *    registers the Fastify request/response/error/close hooks once the
 *    resolved adapter is available.
 *
 * Note: the di container `@Traced` tracing middleware is NOT a returned
 * element. After the `@navios/otel` di-v2 migration it is a `@navios/di`
 * CONTAINER plugin (not a core staged app plugin), so it is registered
 * imperatively via `container.use()` from
 * `OtelFastifyPreAdapterPlugin.register` rather than being added to the
 * returned array. `defineOtelTracingPlugin` is still imported from
 * `@navios/otel`.
 *
 * @param options - Plugin configuration options
 * @returns A 2-tuple: the `pre:adapter-resolve` staged plugin definition
 *   then the (legacy `post:modules-init`) `OtelFastifyPlugin` definition
 *
 * @example
 * ```typescript
 * import { NaviosFactory } from '@navios/core'
 * import { defineFastifyEnvironment } from '@navios/adapter-fastify'
 * import { defineOtelPlugin } from '@navios/otel-fastify'
 *
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineFastifyEnvironment(),
 * })
 *
 * // Register all OTel plugins
 * for (const pluginDef of defineOtelPlugin({
 *   serviceName: 'my-api',
 *   exporter: 'otlp',
 *   exporterOptions: {
 *     endpoint: 'http://localhost:4318/v1/traces',
 *   },
 *   autoInstrument: {
 *     http: true,
 *     handlers: true,
 *   },
 * })) {
 *   app.usePlugin(pluginDef)
 * }
 *
 * await app.listen({ port: 3000 })
 * ```
 */
export function defineOtelPlugin(
  options: FastifyOtelPluginOptions,
): [
  StagedPluginDefinition<'pre:adapter-resolve', FastifyOtelPluginOptions>,
  PluginDefinition<FastifyOtelPluginOptions, FastifyApplicationServiceInterface>,
] {
  return [
    {
      plugin: new OtelFastifyPreAdapterPlugin(),
      options,
    },
    {
      plugin: new OtelFastifyPlugin(),
      options,
    },
  ]
}

// Re-export the plugin classes for advanced usage
export { OtelFastifyPreAdapterPlugin }
