import type { FastifyCorsOptions } from '@fastify/cors'
import type { FastifyMultipartOptions } from '@fastify/multipart'
import type {
  AbstractHttpAdapterInterface,
  LoggerService,
  LogLevel,
} from '@navios/core'
import type {
  FastifyInstance,
  FastifyListenOptions,
  FastifyServerOptions,
} from 'fastify'

/**
 * Configuration options for the Fastify HTTP server.
 *
 * Extends Fastify's native `FastifyServerOptions` with Navios-specific
 * logger configuration. These options are passed to `fastify()` when
 * the server is created.
 *
 * @example
 * ```ts
 * await app.setupHttpServer({
 *   logger: true,
 *   trustProxy: true,
 *   disableRequestLogging: false,
 *   requestIdHeader: 'x-request-id',
 * })
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
 * // All methods from this interface are available on the app instance
 * await app.setupHttpServer({ logger: true })
 * app.enableCors({ origin: true })
 * app.enableMultipart({ limits: { fileSize: 10 * 1024 * 1024 } })
 * await app.init()
 * await app.listen({ port: 3000 })
 * ```
 */
export interface FastifyApplicationServiceInterface
  extends AbstractHttpAdapterInterface<
    FastifyInstance,
    FastifyCorsOptions,
    FastifyApplicationOptions,
    FastifyMultipartOptions
  > {
  setupHttpServer(options: FastifyApplicationOptions): Promise<void>
  initServer(): Promise<void>
  ready(): Promise<void>
  getServer(): FastifyInstance
  /**
   * Sets a global prefix for all routes.
   *
   * @param prefix - The prefix to prepend to all routes.
   */
  setGlobalPrefix(prefix: string): void

  /**
   * Enables CORS (Cross-Origin Resource Sharing) support.
   *
   * @param options - CORS configuration options from `@fastify/cors`.
   */
  enableCors(options: FastifyCorsOptions): void

  /**
   * Enables multipart form data support for file uploads.
   *
   * @param options - Multipart configuration options from `@fastify/multipart`.
   */
  enableMultipart(options: FastifyMultipartOptions): void

  /**
   * Starts the HTTP server and begins listening for requests.
   *
   * @param options - Server listen options.
   * @returns A promise that resolves to the server address.
   */
  listen(options: FastifyListenOptions): Promise<string>

  /**
   * Gracefully shuts down the server.
   */
  dispose(): Promise<void>
}
