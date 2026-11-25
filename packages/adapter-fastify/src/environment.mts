import type { ServerOptions } from 'node:https'

import type { FastifyCorsOptions } from '@fastify/cors'
import type { FastifyMultipartOptions } from '@fastify/multipart'
import type { AdapterDefinition, HttpAdapterEnvironment } from '@navios/server/adapter'
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
 * declare module '@navios/server' {
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

export type MultipartOptions = Omit<
  FastifyMultipartOptions,
  'attachFieldsToBody' | 'onFile' | 'sharedSchemaId'
>

export interface FastifyAdapterOptions extends FastifyServerOptions {
  /** Serves HTTPS, with the options of `https.createServer()`. */
  https?: ServerOptions | null
  /**
   * Enables CORS with `@fastify/cors`. That plugin allows a preflight the
   * methods `GET`, `HEAD` and `POST`, so set `methods` to what the application
   * serves.
   */
  cors?: FastifyCorsOptions
  /**
   * Enables multipart bodies with `@fastify/multipart`. The adapter collects
   * the parts of a body itself, so the plugin's options to do that are not
   * accepted.
   *
   * A body is held in memory, so all of its parts together may have as many
   * bytes as `bodyLimit`, and what `limits` allow on top: `fileSize` for each
   * of `files`, `fieldSize` for each of `fields` (one of each, if not set).
   */
  multipart?: MultipartOptions | true
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
 *   adapter: defineFastifyEnvironment({ multipart: true, trustProxy: true }),
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
