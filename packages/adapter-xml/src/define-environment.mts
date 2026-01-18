import { InjectionToken, XmlStreamAdapterToken } from '@navios/core'

import type { AnyInjectableType } from '@navios/core'

import { XmlStreamAdapterService } from './adapters/index.mjs'

/**
 * Creates the XML environment configuration to be merged with base adapter (Fastify/Bun).
 *
 * @example
 * ```typescript
 * import { defineFastifyEnvironment } from '@navios/adapter-fastify'
 * import { defineXmlEnvironment } from '@navios/adapter-xml'
 * import { NaviosFactory } from '@navios/core'
 *
 * const fastifyEnv = defineFastifyEnvironment()
 * const xmlEnv = defineXmlEnvironment()
 *
 * // Merge environments
 * const mergedEnv = {
 *   httpTokens: new Map([
 *     ...fastifyEnv.httpTokens,
 *     ...xmlEnv.httpTokens,
 *   ]),
 * }
 *
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: mergedEnv,
 * })
 * ```
 */
export function defineXmlEnvironment() {
  const tokens = new Map<InjectionToken<any, undefined>, AnyInjectableType>([
    [XmlStreamAdapterToken, XmlStreamAdapterService],
  ])
  return { tokens }
}
