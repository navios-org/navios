import type { AbstractHttpAdapterInterface, LoggerService, LogLevel } from '@navios/core'
import type { Serve } from 'bun'

// Import after type definitions to avoid circular dependency
import type { BunEnvironment } from './environment.interface.mjs'

/**
 * Configuration options for the Bun HTTP server.
 *
 * Extends Bun's native `Serve.Options` with additional Navios-specific
 * configuration options. These options are passed to `Bun.serve()` when
 * the server is started.
 *
 * @example
 * ```ts
 * app.configure({
 *   development: process.env.NODE_ENV === 'development',
 *   maxRequestBodySize: 1024 * 1024, // 1MB
 * })
 * ```
 *
 * @see {@link https://bun.sh/docs/api/http} Bun HTTP server documentation
 */
export type BunApplicationOptions = Omit<
  Serve.Options<undefined, string>,
  'port' | 'hostname' | 'routes' | 'fetch'
> & {
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
 * await app.init()
 * await app.listen({ port: 3000 })
 * ```
 */
export interface BunApplicationServiceInterface extends AbstractHttpAdapterInterface<BunEnvironment> {
  initServer(): Promise<void>
}
