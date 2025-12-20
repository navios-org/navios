import type { ModuleMetadata } from '../metadata/index.mjs'
import type { AbstractHttpCorsOptions } from './abstract-http-cors-options.interface.mjs'
import type { AbstractHttpListenOptions } from './abstract-http-listen-options.interface.mjs'

/**
 * Abstract interface for HTTP adapters.
 *
 * Adapters implement this interface to provide runtime-specific HTTP server
 * functionality (Fastify, Bun, etc.).
 *
 * @typeParam ServerInstance - The underlying server type (e.g., FastifyInstance)
 * @typeParam CorsOptions - CORS configuration options type
 * @typeParam Options - Server setup options type
 * @typeParam MultipartOptions - Multipart form handling options type
 */
export interface AbstractHttpAdapterInterface<
  ServerInstance,
  CorsOptions = AbstractHttpCorsOptions,
  Options = {},
  MultipartOptions = {},
> {
  /**
   * Sets up the HTTP server with the provided options.
   */
  setupHttpServer(options: Options): Promise<void>

  /**
   * Called after all modules are loaded to register routes.
   */
  onModulesInit(modules: Map<string, ModuleMetadata>): Promise<void>

  /**
   * Signals that the server is ready to accept requests.
   */
  ready(): Promise<void>

  /**
   * Returns the underlying HTTP server instance.
   */
  getServer(): ServerInstance

  /**
   * Sets a global prefix for all routes.
   */
  setGlobalPrefix(prefix: string): void

  /**
   * Gets the current global prefix.
   * Returns empty string if no prefix is set.
   */
  getGlobalPrefix(): string

  /**
   * Enables CORS with the specified options.
   */
  enableCors(options: CorsOptions): void

  /**
   * Enables multipart form data handling.
   */
  enableMultipart(options: MultipartOptions): void

  /**
   * Starts the server and listens for incoming requests.
   */
  listen(options: AbstractHttpListenOptions): Promise<string>

  /**
   * Disposes of the server and cleans up resources.
   */
  dispose(): Promise<void>
}
