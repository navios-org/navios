import type { ModuleMetadata } from '@navios/core'
import type { Serve, Server } from 'bun'

import {
  Container,
  inject,
  Injectable,
  InjectableScope,
  InjectableType,
  Logger,
} from '@navios/core'

import type {
  BunApplicationOptions,
  BunApplicationServiceInterface,
} from '../interfaces/application.interface.mjs'
import type { BunRoutes } from './controller-adapter.service.mjs'

import { BunApplicationServiceToken, BunServerToken } from '../tokens/index.mjs'
import { BunControllerAdapterService } from './controller-adapter.service.mjs'

/**
 * Bun HTTP adapter service implementation for Navios.
 *
 * This service provides the core HTTP server functionality for Navios applications
 * running on the Bun runtime. It handles server initialization, route registration,
 * request handling, and server lifecycle management.
 *
 * @example
 * ```ts
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineBunEnvironment(),
 * })
 *
 * await app.setupHttpServer({
 *   development: true,
 * })
 *
 * await app.init()
 * await app.listen({ port: 3000, hostname: '0.0.0.0' })
 * ```
 *
 * @implements {BunApplicationServiceInterface}
 */
@Injectable({
  token: BunApplicationServiceToken,
})
export class BunApplicationService implements BunApplicationServiceInterface {
  private logger = inject(Logger, {
    context: BunApplicationService.name,
  })
  protected container = inject(Container)
  private server: Server<undefined> | null = null
  private controllerAdapter = inject(BunControllerAdapterService)
  private globalPrefix: string = ''
  private routes: BunRoutes = {}
  private serverOptions: Serve.Options<undefined, string> | null = null

  /**
   * Configures the Bun HTTP server with the provided options.
   *
   * This method should be called before `init()` to set up server configuration.
   * The options will be used when the server is started via `listen()`.
   *
   * @param options - Bun server configuration options including logger settings,
   * development mode, TLS configuration, and other Bun-specific options.
   *
   * @example
   * ```ts
   * await app.setupHttpServer({
   *   development: process.env.NODE_ENV === 'development',
   *   maxRequestBodySize: 1024 * 1024, // 1MB
   * })
   * ```
   */
  async setupHttpServer(options: BunApplicationOptions): Promise<void> {
    // Collect routes from modules
    // But modules are set in onModulesInit, so assume it's called before
    this.serverOptions = options
  }

  /**
   * Initializes the Bun server instance and registers it in the dependency injection container.
   *
   * This method is called automatically during the application initialization process.
   * It makes the server instance available for injection via `BunServerToken`.
   *
   * @throws {Error} If the server has not been created yet.
   */
  async initServer(): Promise<void> {
    // Register server instance
    const instanceName = this.container
      .getServiceLocator()
      .getInstanceIdentifier(BunServerToken)
    this.container
      .getServiceLocator()
      .getManager()
      .storeCreatedHolder(
        instanceName,
        this.server!,
        InjectableType.Class,
        InjectableScope.Singleton,
      )
  }

  /**
   * Marks the server as ready.
   *
   * For Bun, the server is ready immediately upon creation, so this is a no-op.
   */
  async ready(): Promise<void> {
    // Bun server is ready when created
  }

  /**
   * Sets a global prefix for all routes.
   *
   * This prefix will be prepended to all registered route paths. Useful for
   * API versioning or organizing routes under a common path.
   *
   * @param prefix - The prefix to prepend to all routes (e.g., '/api/v1').
   * Should start with a forward slash.
   *
   * @example
   * ```ts
   * app.setGlobalPrefix('/api/v1')
   * // All routes will be prefixed with /api/v1
   * ```
   */
  setGlobalPrefix(prefix: string): void {
    this.globalPrefix = prefix
  }

  /**
   * Gets the current global prefix for all routes.
   *
   * @returns The global prefix string, or empty string if no prefix is set.
   *
   * @example
   * ```ts
   * app.setGlobalPrefix('/api/v1')
   * console.log(app.getGlobalPrefix()) // '/api/v1'
   * ```
   */
  getGlobalPrefix(): string {
    return this.globalPrefix
  }

  /**
   * Gets the underlying Bun server instance.
   *
   * This allows direct access to the Bun server for advanced use cases,
   * such as WebSocket upgrades or custom middleware.
   *
   * @returns The Bun server instance.
   * @throws {Error} If the server has not been initialized yet.
   *
   * @example
   * ```ts
   * const server = app.getServer()
   * // Access Bun-specific server methods
   * ```
   */
  getServer(): Server<undefined> {
    if (!this.server) {
      throw new Error('Server is not initialized. Call createHttpServer first.')
    }
    return this.server
  }

  async onModulesInit(modules: Map<string, ModuleMetadata>): Promise<void> {
    for (const [_moduleName, moduleMetadata] of modules) {
      if (
        !moduleMetadata.controllers ||
        moduleMetadata.controllers.size === 0
      ) {
        continue
      }
      for (const controller of moduleMetadata.controllers) {
        await this.controllerAdapter.setupController(
          controller,
          this.routes,
          moduleMetadata,
          this.globalPrefix,
        )
      }
    }
  }

  /**
   * Fallback request handler for unmatched routes.
   *
   * @returns A 404 Not Found response.
   * @private
   */
  private async handleRequest(): Promise<Response> {
    // This is a fallback if routes don't match
    return new Response('Not Found', { status: 404 })
  }

  /**
   * Enables CORS support.
   *
   * @param _options - CORS options (not currently supported in Bun adapter).
   * @deprecated CORS support is not yet implemented in the Bun adapter.
   */
  enableCors(): void {
    // Ignore for now
  }

  /**
   * Enables multipart form data support.
   *
   * @param _options - Multipart options (not currently supported in Bun adapter).
   * @deprecated Multipart support is handled automatically by Bun's native FormData support.
   */
  enableMultipart(): void {
    // Ignore for now
  }

  /**
   * Starts the Bun HTTP server and begins listening for incoming requests.
   *
   * This method creates and starts the Bun server with the configured routes
   * and options. The server will handle all registered routes and return 404
   * for unmatched requests.
   *
   * @param options - Server listen options including port and hostname.
   * @returns A promise that resolves to a string in the format `hostname:port`
   * indicating where the server is listening.
   *
   * @example
   * ```ts
   * const address = await app.listen({
   *   port: 3000,
   *   hostname: '0.0.0.0',
   * })
   * console.log(`Server listening on ${address}`)
   * ```
   */
  async listen(options: any): Promise<string> {
    // Server is already listening
    const port = options.port || 3000
    const hostname = options.hostname || 'localhost'

    this.server = Bun.serve({
      ...this.serverOptions,
      routes: this.routes,
      port,
      hostname,
      fetch: this.handleRequest.bind(this),
    })
    this.initServer()
    this.logger.log(
      `Bun server listening on http://${hostname}:${port}`,
      'Bootstrap',
    )
    return `${hostname}:${port}`
  }

  /**
   * Gracefully shuts down the Bun server.
   *
   * This method stops the server and cleans up resources. Should be called
   * during application shutdown to ensure proper cleanup.
   *
   * @example
   * ```ts
   * process.on('SIGTERM', async () => {
   *   await app.dispose()
   *   process.exit(0)
   * })
   * ```
   */
  async dispose(): Promise<void> {
    this.server?.stop()
  }
}
