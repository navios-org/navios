import type { FastifyCorsOptions } from '@fastify/cors'
import type { FastifyMultipartOptions } from '@fastify/multipart'
import type { HttpAdapterEnvironment } from '@navios/core'
import type { FastifyInstance, FastifyListenOptions } from 'fastify'

import type {
  FastifyApplicationOptions,
  FastifyApplicationServiceInterface,
} from './application.interface.mjs'

/**
 * Environment interface for the Fastify HTTP adapter.
 *
 * Provides type-safe access to Fastify-specific types when using
 * `NaviosApplication<FastifyEnvironment>`.
 *
 * @example
 * ```typescript
 * import { defineFastifyEnvironment, FastifyEnvironment } from '@navios/adapter-fastify'
 * import { NaviosFactory } from '@navios/core'
 *
 * const app = await NaviosFactory.create<FastifyEnvironment>(AppModule, {
 *   adapter: defineFastifyEnvironment(),
 * })
 *
 * // All methods are now type-safe for Fastify
 * app.configure({ trustProxy: true })
 * app.enableCors({ origin: true }) // FastifyCorsOptions
 * const server = app.getServer() // FastifyInstance
 * await app.listen({ port: 3000 }) // FastifyListenOptions
 * ```
 */
export interface FastifyEnvironment extends HttpAdapterEnvironment {
  /** FastifyInstance from the fastify package */
  server: FastifyInstance
  /** FastifyCorsOptions from @fastify/cors */
  corsOptions: FastifyCorsOptions
  /** FastifyMultipartOptions from @fastify/multipart */
  multipartOptions: FastifyMultipartOptions
  /** FastifyListenOptions for server listen configuration */
  listenOptions: FastifyListenOptions
  /** FastifyApplicationOptions for server setup */
  options: FastifyApplicationOptions
  /** FastifyApplicationServiceInterface for the Fastify application service */
  adapter: FastifyApplicationServiceInterface
}
