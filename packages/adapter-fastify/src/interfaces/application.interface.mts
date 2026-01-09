import type { AbstractHttpAdapterInterface, LoggerService, LogLevel } from '@navios/core'
import type { FastifyServerOptions } from 'fastify'

/**
 * Configuration options for the Fastify HTTP server.
 *
 * Extends Fastify's native `FastifyServerOptions` with Navios-specific
 * logger configuration. These options are passed to `fastify()` when
 * the server is created.
 *
 * @example
 * ```ts
 * app.configure({
 *   logger: true,
 *   trustProxy: true,
 *   disableRequestLogging: false,
 *   requestIdHeader: 'x-request-id',
 * })
 * await app.init()
 * ```
 *
 * @see {@link https://www.fastify.io/docs/latest/Reference/Server/} Fastify server options documentation
 */
export interface FastifyApplicationOptions
  extends Omit<FastifyServerOptions, 'logger'> {
  /**
   * Specifies the logger to use. Pass `false` to turn off logging.
   *
   * - `LoggerService`: Use a custom logger service instance
   * - `LogLevel[]`: Array of log levels to enable (e.g., `['error', 'warn']`)
   * - `false`: Disable logging completely
   * - `true`: Use default Pino logger
   */
  logger?: LoggerService | LogLevel[] | false
}

// Import after type definitions to avoid circular dependency
import type { FastifyEnvironment } from './environment.interface.mjs'

/**
 * Interface for the Fastify application service.
 *
 * This interface defines the contract for the Fastify HTTP adapter service,
 * extending the base `AbstractHttpAdapterInterface` with Fastify-specific
 * methods and types. It includes support for CORS, multipart form data,
 * and full access to Fastify's plugin ecosystem.
 *
 * @extends {AbstractHttpAdapterInterface}
 *
 * @example
 * ```ts
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineFastifyEnvironment(),
 * })
 *
 * app.configure({ logger: true })
 * app.enableCors({ origin: true })
 * app.enableMultipart({ limits: { fileSize: 10 * 1024 * 1024 } })
 * await app.init()
 * await app.listen({ port: 3000 })
 * ```
 */
export interface FastifyApplicationServiceInterface
  extends AbstractHttpAdapterInterface<FastifyEnvironment> {
  initServer(): Promise<void>
}
