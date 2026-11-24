/**
 * `@navios/otel-fastify` is deprecated. In 2.0 the OpenTelemetry plugin is
 * adapter-neutral and lives in `@navios/otel`; this package only re-exports
 * it so that existing imports keep resolving.
 *
 * ```ts
 * // before
 * import { defineOtelPlugin } from '@navios/otel-fastify'
 * // after
 * import { otelPlugin } from '@navios/otel'
 * ```
 */
import { otelPlugin } from '@navios/otel'

import type { OtelPluginOptions } from '@navios/otel'

/**
 * @deprecated Import `otelPlugin` from `@navios/otel`.
 */
export const defineOtelPlugin = otelPlugin

/**
 * @deprecated Import `OtelPluginOptions` from `@navios/otel`.
 */
export type FastifyOtelPluginOptions = OtelPluginOptions

/**
 * @deprecated Import from `@navios/otel`.
 */
export { otelPlugin }
export type { OtelPluginOptions }
