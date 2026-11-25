import { definePlugin, Logger } from '@navios/core'
import { getInjectableToken } from '@navios/di'

import { OtelConfigToken } from './config/otel-config-token.mjs'
import { OtelHandlerInterceptor } from './handlers/otel-handler-interceptor.mjs'
import { MeterToken } from './sdk/meter-token.mjs'
import { OtelSetupService } from './sdk/otel-setup-service.mjs'
import { TracerToken } from './sdk/tracer-token.mjs'
import { traceInstance } from './traced/trace-instance.mjs'
import { getTraceableServices } from './traced/traceable-services.mjs'
import { extractTracedMetadata, hasTracedMetadata } from './traced/traced-metadata.mjs'

import type { OtelConfig } from './config/otel-config.mjs'

/**
 * Options of `otelPlugin`.
 */
export type OtelPluginOptions = OtelConfig

/**
 * OpenTelemetry for a Navios application, on any adapter.
 *
 * - Starts the OpenTelemetry SDK and provides `TracerToken`, `MeterToken`,
 *   `OtelConfigToken` and `OtelSetupService`.
 * - Traces every HTTP request with one interceptor (`OtelHttpInterceptor`).
 * - Makes services marked with `@Traced` / `@Traceable` start a child span
 *   around their method calls.
 * - Flushes and shuts the SDK down when the application closes.
 *
 * Classes marked with `@Traced` / `@Traceable` are collected in a
 * module-level set when they are decorated, and the plugin reads that set
 * once, during `init()`. A class that is first imported after `init()` is
 * not traced.
 *
 * @example
 * ```typescript
 * import { NaviosFactory } from '@navios/server'
 * import { otelPlugin } from '@navios/otel'
 *
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineFastifyEnvironment(),
 *   plugins: [
 *     otelPlugin({
 *       serviceName: 'my-api',
 *       exporter: 'otlp',
 *       exporterOptions: { endpoint: 'http://localhost:4318/v1/traces' },
 *       ignoreRoutes: ['/health'],
 *     }),
 *   ],
 * })
 * ```
 */
export const otelPlugin = definePlugin({
  name: 'otel',
  async setup(api, options: OtelPluginOptions) {
    const logger = await api.container.get(Logger, { context: 'Otel' })

    const sdk = new OtelSetupService()
    await sdk.initialize(options, logger)
    const config = sdk.getConfig()
    const tracer = sdk.getTracer()

    api.provide(OtelSetupService, { value: sdk })
    api.provide(OtelConfigToken, { value: config })
    api.provide(TracerToken, { value: tracer })
    api.provide(MeterToken, { value: sdk.getMeter() })

    for (const serviceClass of getTraceableServices()) {
      if (!hasTracedMetadata(serviceClass)) {
        continue
      }
      const metadata = extractTracedMetadata(serviceClass)
      if (!metadata.enabled && metadata.methods.size === 0) {
        continue
      }
      let token
      try {
        token = getInjectableToken(serviceClass)
      } catch {
        // Marked for tracing but not injectable: the container never builds it.
        continue
      }
      api.decorate(token, (instance) => traceInstance(instance as object, serviceClass, tracer))
    }

    const { http: traceHttp, transports: traceHandlers } = config.autoInstrument

    // The HTTP part is loaded only here, so that this package works where
    // `@navios/server` is not installed.
    let http: typeof import('./http/index.mjs') | null = null
    if (traceHttp || traceHandlers === 'auto') {
      try {
        http = await import('./http/index.mjs')
      } catch (error) {
        if (!isMissingServerPackage(error)) {
          throw error
        }
      }
    }
    const servesHttp = http?.hasHttpTransport(api) ?? false

    if (traceHttp) {
      if (servesHttp) {
        http!.instrumentHttp(api)
      } else {
        logger.debug(
          http === null
            ? 'HTTP requests are not traced: @navios/server is not installed'
            : 'HTTP requests are not traced: the application has no HTTP transport',
        )
      }
    }
    if (traceHandlers === true || (traceHandlers === 'auto' && !servesHttp)) {
      api.intercept(OtelHandlerInterceptor)
    }

    api.onShutdown(() => sdk.shutdown())
  },
})

function isMissingServerPackage(error: unknown): boolean {
  const { code, message } = error as { code?: string; message?: string }
  return (
    (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') &&
    typeof message === 'string' &&
    // The package itself, not something a file inside it failed to import.
    /Cannot find (package|module) '@navios\/server['/]/.test(message)
  )
}
