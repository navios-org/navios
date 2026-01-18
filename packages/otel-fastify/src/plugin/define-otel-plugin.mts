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
  NaviosPlugin,
  PluginContext,
  PluginDefinition,
  StagedPluginDefinition,
} from '@navios/core'
import type { FastifyInstance } from 'fastify'

import { createOnErrorHook, createOnRequestHook, createOnResponseHook } from '../hooks/index.mjs'

import type { FastifyOtelPluginOptions } from '../interfaces/index.mjs'

/**
 * OpenTelemetry plugin for Fastify adapter.
 *
 * This plugin integrates OpenTelemetry tracing with your Navios application.
 * It automatically creates spans for incoming HTTP requests and provides
 * context propagation for distributed tracing.
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
 * Creates an OpenTelemetry plugin for Fastify adapter.
 *
 * This plugin integrates OpenTelemetry tracing with your Navios application.
 * It automatically creates spans for incoming HTTP requests and provides
 * context propagation for distributed tracing.
 *
 * @param options - Plugin configuration options
 * @returns A plugin definition that can be registered with the application
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
 * app.usePlugin(defineOtelPlugin({
 *   serviceName: 'my-api',
 *   exporter: 'otlp',
 *   exporterOptions: {
 *     endpoint: 'http://localhost:4318/v1/traces',
 *   },
 *   autoInstrument: {
 *     http: true,
 *     handlers: true,
 *   },
 * }))
 *
 * await app.listen({ port: 3000 })
 * ```
 */
export function defineOtelPlugin(options: FastifyOtelPluginOptions) {
  return [
    defineOtelTracingPlugin({}),
    {
      plugin: new OtelFastifyPlugin(),
      options,
    },
  ]
}
