import { definePlugin } from '@navios/di'

import type { ClassTypeWithInstance, Plugin } from '@navios/di'

import { hasTracedMetadata } from '../decorators/traced.decorator.mjs'
import { TracedProxyFactory } from '../services/traced-proxy.factory.mjs'

/**
 * Options for the OTel tracing plugin.
 *
 * Kept as an (currently empty) interface so future options like sampling
 * or filtering can be added without changing the public factory signature.
 */
export interface OtelTracingPluginOptions {
  // Future options like sampling, filtering, etc.
}

/**
 * Creates a di v2 plugin that transparently wraps `@Traceable`/`@Traced`
 * decorated services with an OpenTelemetry tracing proxy.
 *
 * Unlike the previous `pre:adapter-resolve` integration (which synthesized
 * a `:original` token, registered a wrapper factory with bumped priority,
 * and juggled the registry), this is a single resolution `middleware`:
 *
 * 1. It lets the container create the real instance (`await next()`).
 * 2. If the resolved value is an object whose class carries traced
 *    metadata, it asks {@link TracedProxyFactory} to wrap it.
 * 3. Everything else is returned untouched.
 *
 * The middleware is composed Koa-style with other plugins; it is registered
 * via the container `plugins` option.
 *
 * @example
 * ```typescript
 * import { Container } from '@navios/di'
 * import { defineOtelTracingPlugin } from '@navios/otel'
 *
 * const container = new Container({
 *   plugins: [defineOtelTracingPlugin({})],
 * })
 * ```
 */
export const defineOtelTracingPlugin = (
  _options: OtelTracingPluginOptions = {},
): Plugin =>
  definePlugin({
    name: 'otel-tracing',
    async middleware(ctx, next) {
      const instance = await next()
      if (instance == null || typeof instance !== 'object') {
        return instance
      }
      if (!hasTracedMetadata(ctx.target)) {
        return instance
      }
      const factory = await ctx.container.get(TracedProxyFactory)
      return factory.wrap(
        instance as object,
        ctx.target as ClassTypeWithInstance<object>,
      )
    },
  })
