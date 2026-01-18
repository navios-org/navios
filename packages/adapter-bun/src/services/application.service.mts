import {
  Container,
  ErrorResponseProducerService,
  FrameworkError,
  inject,
  Injectable,
  Logger,
} from '@navios/core'

import type { ModuleMetadata } from '@navios/core'
import type { BunRequest, Serve, Server } from 'bun'

import {
  BunApplicationServiceToken,
  BunControllerAdapterToken,
  BunServerToken,
} from '../tokens/index.mjs'
import { applyCorsToResponse, calculatePreflightHeaders, isPreflight } from '../utils/cors.util.mjs'

import type {
  BunApplicationOptions,
  BunApplicationServiceInterface,
} from '../interfaces/application.interface.mjs'
import type { BunCorsOptions } from '../utils/cors.util.mjs'

import type { BunRoutes } from './controller-adapter.service.mjs'

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
 * app.configure({ development: true })
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
  private errorProducer = inject(ErrorResponseProducerService)
  private server: Server<undefined> | null = null
  private controllerAdapter = inject(BunControllerAdapterToken)
  private globalPrefix: string = ''
  private routes: BunRoutes = {}
  private serverOptions: BunApplicationOptions | null = null
  private corsOptions: BunCorsOptions | null = null
  private configureOptions: Partial<BunApplicationOptions> = {}

  /**
   * app.configure({
   *   development: process.env.NODE_ENV === 'development',
   *   maxRequestBodySize: 1024 * 1024, // 1MB
   * })
   * await app.init()
   * ```
   */
  async setupAdapter(options: unknown): Promise<void> {
    // Merge configure options with passed options (configure takes precedence)
    const mergedOptions = {
      ...(options as BunApplicationOptions),
      ...this.configureOptions,
    } as BunApplicationOptions
    // Collect routes from modules
    // But modules are set in onModulesInit, so assume it's called before
    this.serverOptions = mergedOptions
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
    this.container.addInstance(BunServerToken, this.server!)
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
      if (!moduleMetadata.controllers || moduleMetadata.controllers.size === 0) {
        continue
      }
      for (const controller of moduleMetadata.controllers) {
        await this.controllerAdapter.setupController(
          controller,
          this.routes,
          moduleMetadata,
          this.globalPrefix,
          this.corsOptions,
        )
      }
    }
  }

  /**
   * Fallback request handler for unmatched routes and CORS preflight.
   *
   * Handles:
   * - CORS preflight (OPTIONS) requests
   * - 404 responses for unmatched routes with CORS headers
   *
   * @param request - The incoming request
   * @returns A Response with appropriate status and CORS headers
   * @private
   */
  private async handleRequest(request: BunRequest): Promise<Response> {
    const origin = request.headers.get('Origin')
    const accessControlRequestMethod = request.headers.get('Access-Control-Request-Method')

    // Handle CORS preflight requests
    if (this.corsOptions && isPreflight(request.method, origin, accessControlRequestMethod)) {
      const requestHeaders = request.headers.get('Access-Control-Request-Headers')
      const preflightHeaders = await calculatePreflightHeaders(
        origin ?? undefined,
        accessControlRequestMethod,
        requestHeaders,
        this.corsOptions,
      )

      if (preflightHeaders) {
        return new Response(null, {
          status: 204,
          headers: preflightHeaders as HeadersInit,
        })
      }
    }

    // Build 404 response using ErrorResponseProducerService
    const errorResponse = this.errorProducer.respond(
      FrameworkError.NotFound,
      null,
      `Route [${request.method}] ${request.url} not found`,
    )

    const response = new Response(JSON.stringify(errorResponse.payload), {
      status: errorResponse.statusCode,
      headers: errorResponse.headers,
    })

    // Apply CORS headers to the error response
    return applyCorsToResponse(response, origin, this.corsOptions)
  }

  /**
   * Enables CORS (Cross-Origin Resource Sharing) support.
   *
   * Configures CORS headers for all routes. The options are applied when
   * handling requests.
   *
   * @param options - CORS configuration options.
   *
   * @example
   * ```ts
   * app.enableCors({
   *   origin: true, // Allow all origins
   *   methods: ['GET', 'POST', 'PUT', 'DELETE'],
   *   credentials: true,
   * })
   * ```
   */
  enableCors(options: BunCorsOptions): void {
    this.corsOptions = options
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
      ...(this.serverOptions as Serve.Options<undefined, string>),
      routes: this.routes,
      port,
      hostname,
      fetch: this.handleRequest.bind(this),
    })
    this.initServer()
    this.logger.log(`Bun server listening on http://${hostname}:${port}`, 'Bootstrap')
    return `${hostname}:${port}`
  }

  /**
   * Configures the adapter with additional options before initialization.
   *
   * Options set via configure() are merged with options passed to
   * setupAdapter(), with configure() options taking precedence.
   * Must be called before init().
   *
   * @param options - Partial Bun server configuration options
   *
   * @example
   * ```ts
   * app.configure({ development: true })
   * await app.init()
   * ```
   */
  configure(options: Partial<BunApplicationOptions>): void {
    this.configureOptions = {
      ...this.configureOptions,
      ...(options as Record<string, unknown>),
    }
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
