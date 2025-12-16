import type { AnyInjectableType } from '@navios/di'

import { XmlStreamAdapterToken } from '@navios/core'
import { InjectionToken } from '@navios/di'

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
  const httpTokens = new Map<InjectionToken<any, undefined>, AnyInjectableType>([
    [XmlStreamAdapterToken, XmlStreamAdapterService],
  ])
  return {
    httpTokens,
  }
}
