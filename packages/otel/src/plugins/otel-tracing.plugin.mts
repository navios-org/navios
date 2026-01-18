import { definePreAdapterResolvePlugin } from '@navios/core'
import { getInjectableToken, InjectionToken, InjectableType } from '@navios/di'

import {
  extractTracedMetadata,
  getTraceableServices,
  hasTracedMetadata,
} from '../decorators/traced.decorator.mjs'
import { createTracedWrapperFactory } from '../factories/traced-wrapper.factory.mjs'

/**
 * Options for the OTel tracing plugin.
 */
export interface OtelTracingPluginOptions {
  // Future options like sampling, filtering, etc.
}

/**
 * Plugin that automatically wraps @Traceable and @Traced decorated services
 * with tracing proxies at application startup.
 *
 * This plugin runs at the `pre:adapter-resolve` stage, which is before
 * any services are instantiated. It:
 * 1. Iterates through all services decorated with @Traceable or @Traced
 * 2. Creates a new token for the original service
 * 3. Registers a wrapper factory with higher priority that produces traced instances
 *
 * @example
 * ```typescript
 * import { defineOtelTracingPlugin } from '@navios/otel'
 *
 * const app = await NaviosApplication.create(AppModule)
 * app.usePlugin(defineOtelTracingPlugin({}))
 * await app.listen()
 * ```
 */
export const defineOtelTracingPlugin = definePreAdapterResolvePlugin<OtelTracingPluginOptions>({
  name: 'otel-tracing',
  register: async (context, _options) => {
    const { container } = context
    const registry = container.getRegistry()
    const traceableServices = getTraceableServices()

    for (const serviceClass of traceableServices) {
      let serviceToken
      try {
        serviceToken = getInjectableToken(serviceClass)
      } catch {
        // Service not registered with @Injectable - skip
        continue
      }

      if (!registry.has(serviceToken)) {
        continue // Not registered in DI
      }

      if (!hasTracedMetadata(serviceClass)) {
        continue // No metadata (shouldn't happen but be safe)
      }

      const metadata = extractTracedMetadata(serviceClass)

      // Skip if no methods to trace (enabled: false and no methods)
      if (!metadata.enabled && metadata.methods.size === 0) {
        continue
      }

      const record = registry.get(serviceToken)

      // Create a new token for the original service
      // IMPORTANT: Preserve the schema from the original token for parameterized services
      const originalToken = serviceToken.schema
        ? InjectionToken.create(`${serviceToken.id}:original`, serviceToken.schema)
        : InjectionToken.create(`${serviceToken.id}:original`)

      // Register original under new token (same priority)
      registry.set(originalToken, record.scope, record.target, record.type, record.priority)

      // Create wrapper factory
      const WrapperFactory = createTracedWrapperFactory(originalToken, serviceClass)

      // Register wrapper factory with higher priority
      registry.set(
        serviceToken,
        record.scope,
        WrapperFactory,
        InjectableType.Factory,
        record.priority + 1, // Higher priority
      )
    }
  },
})
