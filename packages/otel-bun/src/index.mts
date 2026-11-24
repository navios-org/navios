/**
 * `@navios/otel-bun` is deprecated. In 2.0 the OpenTelemetry plugin is
 * adapter-neutral and lives in `@navios/otel`; this package only re-exports
 * it so that existing imports keep resolving.
 *
 * ```ts
 * // before
 * import { defineOtelPlugin } from '@navios/otel-bun'
 * for (const plugin of defineOtelPlugin(options)) {
 *   app.usePlugin(plugin)
 * }
 * // after
 * import { otelPlugin } from '@navios/otel'
 * app.usePlugin(otelPlugin(options))
 * ```
 */
import { otelPlugin } from '@navios/otel'

import type { PluginInstance } from '@navios/core'
import type { OtelPluginOptions } from '@navios/otel'

/**
 * Returns the plugin of `@navios/otel` in a one-element array, because 1.x
 * code registers the result of this function in a loop.
 *
 * @deprecated Use `otelPlugin(options)` from `@navios/otel`.
 */
export function defineOtelPlugin(options: OtelPluginOptions): [PluginInstance] {
  return [otelPlugin(options)]
}

/**
 * @deprecated Import `OtelPluginOptions` from `@navios/otel`.
 */
export type BunOtelPluginOptions = OtelPluginOptions

/**
 * @deprecated Import from `@navios/otel`.
 */
export { otelPlugin }
export type { OtelPluginOptions }
