import type {
  AbstractHttpAdapterInterface,
  LoggerService,
  LogLevel,
} from '@navios/core'
import type { Serve, Server } from 'bun'

/**
 * Configuration options for the Bun HTTP server.
 *
 * Extends Bun's native `Serve.Options` with additional Navios-specific
 * configuration options. These options are passed to `Bun.serve()` when
 * the server is started.
 *
 * @example
 * ```ts
 * await app.setupHttpServer({
 *   development: process.env.NODE_ENV === 'development',
 *   maxRequestBodySize: 1024 * 1024, // 1MB
 *   logger: ['error', 'warn'],
 * })
 * ```
 *
 * @see {@link https://bun.sh/docs/api/http} Bun HTTP server documentation
 */
export type BunApplicationOptions = Serve.Options<undefined, string> & {
  /**
   * Specifies the logger to use. Pass `false` to turn off logging.
   *
   * - `LoggerService`: Use a custom logger service instance
   * - `LogLevel[]`: Array of log levels to enable (e.g., `['error', 'warn']`)
   * - `false`: Disable logging completely
   */
  logger?: LoggerService | LogLevel[] | false
}

/**
 * Interface for the Bun application service.
 *
 * This interface defines the contract for the Bun HTTP adapter service,
 * extending the base `AbstractHttpAdapterInterface` with Bun-specific
 * methods and types.
 *
 * @extends {AbstractHttpAdapterInterface}
 *
 * @example
 * ```ts
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineBunEnvironment(),
 * })
 *
 * // All methods from this interface are available on the app instance
 * await app.setupHttpServer({ development: true })
 * await app.init()
 * await app.listen({ port: 3000 })
 * ```
 */
export interface BunApplicationServiceInterface
  extends AbstractHttpAdapterInterface<
    Server<undefined>,
    never, // No CORS support for now
    BunApplicationOptions,
    never // No multipart support for now
  > {
  setupHttpServer(options: BunApplicationOptions): Promise<void>
  initServer(): Promise<void>
  ready(): Promise<void>
  getServer(): Server<undefined>
  /**
   * Sets a global prefix for all routes.
   *
   * @param prefix - The prefix to prepend to all routes.
   */
  setGlobalPrefix(prefix: string): void

  /**
   * Enables CORS support (not currently implemented).
   *
   * @param options - CORS options (not supported).
   * @deprecated CORS support is not yet implemented in the Bun adapter.
   */
  enableCors(options: never): void

  /**
   * Enables multipart form data support (handled automatically by Bun).
   *
   * @param options - Multipart options (not supported).
   * @deprecated Multipart support is handled automatically by Bun's native FormData support.
   */
  enableMultipart(options: never): void

  /**
   * Starts the HTTP server and begins listening for requests.
   *
   * @param options - Server listen options.
   * @returns A promise that resolves to the server address.
   */
  listen(options: BunListenOptions): Promise<string>

  /**
   * Gracefully shuts down the server.
   */
  dispose(): Promise<void>
}

/**
 * Options for starting the Bun HTTP server.
 *
 * These options control where and how the server listens for incoming requests.
 *
 * @example
 * ```ts
 * await app.listen({
 *   port: 3000,
 *   hostname: '0.0.0.0', // Listen on all interfaces
 * })
 * ```
 */
export interface BunListenOptions {
  /**
   * The port number to listen on.
   *
   * @default 3000
   */
  port?: number

  /**
   * The hostname or IP address to bind to.
   *
   * Use `'0.0.0.0'` to listen on all network interfaces,
   * or `'localhost'` to only accept local connections.
   *
   * @default 'localhost'
   */
  hostname?: string
}
