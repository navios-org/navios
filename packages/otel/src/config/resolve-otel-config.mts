import type { OtelConfig, ResolvedOtelConfig } from './otel-config.mjs'

/**
 * Resolves configuration with defaults applied.
 */
export function resolveOtelConfig(config: OtelConfig): ResolvedOtelConfig {
  return {
    ...config,
    autoInstrument: {
      http: config.autoInstrument?.http ?? true,
      transports: config.autoInstrument?.transports ?? 'auto',
    },
    metrics: {
      enabled: config.metrics?.enabled ?? false,
    },
    sampling: {
      ratio: config.sampling?.ratio ?? 1.0,
    },
    includeNaviosAttributes: config.includeNaviosAttributes ?? false,
    ignoreRoutes: config.ignoreRoutes ?? [],
    registerGlobally: config.registerGlobally ?? true,
  }
}
