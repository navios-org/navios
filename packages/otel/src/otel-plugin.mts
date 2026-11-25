import { definePlugin, httpTransport, Logger } from '@navios/core'
import { getInjectableToken } from '@navios/di'

import { OtelConfigToken } from './config/otel-config-token.mjs'
import { OtelHttpInterceptor } from './http/otel-http-interceptor.mjs'
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
 * import { NaviosFactory } from '@navios/core'
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

    if (config.autoInstrument.http) {
      // Around HTTP routes only; an application without HTTP has none to trace.
      api.transport(httpTransport)?.intercept(OtelHttpInterceptor)
    }

    api.onShutdown(() => sdk.shutdown())
  },
})
