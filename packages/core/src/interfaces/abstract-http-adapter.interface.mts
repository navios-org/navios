import type { ModuleMetadata } from '../metadata/index.mjs'
import type { AbstractAdapterInterface } from './abstract-adapter.interface.mjs'
import type { HttpAdapterEnvironment } from './adapter-environment.interface.mjs'

/**
 * Interface for HTTP adapters extending the base adapter interface.
 *
 * Adapters implement this interface to provide runtime-specific HTTP server
 * functionality (Fastify, Bun, etc.).
 *
 * @typeParam Environment - The adapter environment providing type-safe access to
 *                          server instance, CORS options, listen options, etc.
 */
export interface AbstractHttpAdapterInterface<
  Environment extends HttpAdapterEnvironment = HttpAdapterEnvironment,
> extends AbstractAdapterInterface {
  /**
   * Sets up the adapter with the provided options.
   * Called during application initialization before modules are initialized.
   */
  setupAdapter(options: Environment['options']): Promise<void>

  /**
   * Called after all modules are loaded to register routes.
   */
  onModulesInit(modules: Map<string, ModuleMetadata>): Promise<void>

  /**
   * Signals that the server is ready to accept requests.
   */
  ready(): Promise<void>

  /**
   * Disposes of the server and cleans up resources.
   */
  dispose(): Promise<void>

  /**
   * Returns the underlying HTTP server instance.
   */
  getServer(): Environment['server']

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
  enableCors(options: Environment['corsOptions']): void

  /**
   * Enables multipart form data handling.
   */
  enableMultipart(options: Environment['multipartOptions']): void

  /**
   * Starts the server and listens for incoming requests.
   */
  listen(options: Environment['listenOptions']): Promise<string>

  /**
   * Configures the adapter with additional options before init.
   *
   * This method allows setting adapter-specific configuration options
   * before the server is initialized. Options set via configure() are
   * merged with options passed to setupAdapter().
   *
   * Must be called before setupAdapter().
   */
  configure(options: Partial<Environment['options']>): void
}
