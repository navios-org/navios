import type { AbstractAdapterInterface } from './abstract-adapter.interface.mjs'

/**
 * Base interface for adapter environments.
 *
 * All adapter environments extend this interface to provide
 * type-safe access to adapter-specific configuration options.
 */
export interface AdapterEnvironment {
  /**
   * Adapter setup/configuration options type
   */
  options: unknown
  /**
   * Adapter type
   */
  adapter: AbstractAdapterInterface
}

/**
 * Environment interface for HTTP adapters.
 *
 * Each HTTP adapter (Fastify, Bun, etc.) implements this interface to provide
 * type-safe access to HTTP-specific types throughout the application.
 *
 * @example
 * ```typescript
 * // Using with a specific adapter
 * import { FastifyEnvironment } from '@navios/adapter-fastify'
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
export interface HttpAdapterEnvironment extends AdapterEnvironment {
  /**
   * The underlying HTTP server instance type (e.g., FastifyInstance, Bun.Server)
   */
  server: unknown

  /**
   * CORS configuration options type
   */
  corsOptions: unknown

  /**
   * Multipart form data configuration options type
   */
  multipartOptions: unknown

  /**
   * Server listen options type (port, host, etc.)
   */
  listenOptions: unknown
}

/**
 * Default environment with unknown types.
 *
 * Forces users to specify an Environment generic for type-safe adapter access.
 * When no generic is provided to `NaviosApplication` or `NaviosFactory.create()`,
 * this default is used, resulting in `unknown` types for all adapter-specific
 * methods.
 */
export interface DefaultAdapterEnvironment extends AdapterEnvironment {
  options: unknown
}
