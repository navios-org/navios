import type { FastifyCorsOptions } from '@fastify/cors'
import type { FastifyMultipartOptions } from '@fastify/multipart'
import type { AdapterDefinition, HttpAdapterEnvironment } from '@navios/core'
import type {
  FastifyInstance,
  FastifyListenOptions,
  FastifyReply,
  FastifyRequest,
  FastifyServerOptions,
} from 'fastify'

import { FastifyAdapter } from './fastify-adapter.mjs'

/**
 * Types an application that runs on Fastify:
 *
 * ```ts
 * declare module '@navios/core' {
 *   interface Register {
 *     environment: FastifyEnvironment
 *   }
 * }
 * ```
 */
export interface FastifyEnvironment extends HttpAdapterEnvironment {
  raw: { request: FastifyRequest; reply: FastifyReply }
  server: FastifyInstance
  listenOptions: FastifyListenOptions
}

export interface FastifyAdapterOptions extends FastifyServerOptions {
  /** Enables CORS with `@fastify/cors`. */
  cors?: FastifyCorsOptions
  /** Enables multipart bodies with `@fastify/multipart`. */
  multipart?: FastifyMultipartOptions | true
  /**
   * Called with the Fastify instance before any route is registered, to add
   * plugins, hooks or decorators.
   */
  configure?: (server: FastifyInstance) => void | Promise<void>
}

/**
 * Runs a Navios application on Fastify.
 *
 * ```ts
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineFastifyEnvironment({ cors: { origin: true }, multipart: true }),
 * })
 * await app.listen({ port: 3000 })
 * ```
 */
export function defineFastifyEnvironment(
  options: FastifyAdapterOptions = {},
): AdapterDefinition<FastifyEnvironment> {
  return {
    name: 'fastify',
    create: (context) => FastifyAdapter.create(options, context),
  }
}
