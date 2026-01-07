import type { FastifyCorsOptions } from '@fastify/cors'
import type { FastifyMultipartOptions } from '@fastify/multipart'
import type { ModuleMetadata } from '@navios/core'
import type {
  FastifyInstance,
  FastifyListenOptions,
  FastifyReply,
  FastifyRequest,
  FastifyServerOptions,
} from 'fastify'

import {
  Container,
  ErrorResponseProducerService,
  FrameworkError,
  HttpException,
  inject,
  Injectable,
  Logger,
} from '@navios/core'

import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { fastify } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { ZodError } from 'zod/v4'

import type {
  FastifyApplicationOptions,
  FastifyApplicationServiceInterface,
} from '../interfaces/application.interface.mjs'

import { FastifyApplicationServiceToken } from '../tokens/index.mjs'
import { FastifyServerToken } from '../tokens/server.token.mjs'
import { FastifyControllerAdapterService } from './controller-adapter.service.mjs'
import { PinoWrapper } from './pino-wrapper.mjs'

/**
 * Fastify HTTP adapter service implementation for Navios.
 *
 * This service provides the core HTTP server functionality for Navios applications
 * running on the Fastify runtime. It handles server initialization, route registration,
 * request handling, CORS configuration, multipart support, and server lifecycle management.
 *
 * @example
 * ```ts
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineFastifyEnvironment(),
 * })
 *
 * await app.setupHttpServer({
 *   logger: true,
 *   trustProxy: true,
 * })
 *
 * app.enableCors({ origin: true })
 * app.enableMultipart({ limits: { fileSize: 10 * 1024 * 1024 } })
 *
 * await app.init()
 * await app.listen({ port: 3000, host: '0.0.0.0' })
 * ```
 *
 * @implements {FastifyApplicationServiceInterface}
 */
@Injectable({
  token: FastifyApplicationServiceToken,
})
export class FastifyApplicationService implements FastifyApplicationServiceInterface {
  private logger = inject(Logger, {
    context: FastifyApplicationService.name,
  })
  protected container = inject(Container)
  private errorProducer = inject(ErrorResponseProducerService)
  private server: FastifyInstance | null = null
  private controllerAdapter = inject(FastifyControllerAdapterService)
  private globalPrefix: string = ''

  private corsOptions: FastifyCorsOptions | null = null
  private multipartOptions: FastifyMultipartOptions | true | null = null

  /**
   * Configures and initializes the Fastify HTTP server with the provided options.
   *
   * This method should be called before `init()` to set up server configuration.
   * It creates the Fastify instance, configures logging, and prepares the server
   * for route registration.
   *
   * @param options - Fastify server configuration options including logger settings,
   * trust proxy configuration, and other Fastify-specific options.
   *
   * @example
   * ```ts
   * await app.setupHttpServer({
   *   logger: true,
   *   trustProxy: true,
   *   disableRequestLogging: false,
   * })
   * ```
   */
  async setupHttpServer(options: FastifyApplicationOptions): Promise<void> {
    const { logger, ...fastifyOptions } = options
    if (logger) {
      const serverOptions = fastifyOptions as FastifyServerOptions
      if (typeof logger === 'boolean') {
        if (!logger) {
          serverOptions.logger = false
        }
      } else {
        serverOptions.loggerInstance = await this.container.get(PinoWrapper)
      }
      this.server = fastify(serverOptions)
    } else {
      this.server = fastify({
        ...fastifyOptions,
        loggerInstance: await this.container.get(PinoWrapper),
      } as FastifyServerOptions)
    }
    await this.initServer()
  }

  /**
   * Initializes the Fastify server instance and configures plugins.
   *
   * This method is called automatically during server setup. It configures
   * error handlers, not found handlers, schema validators, and registers
   * the server instance in the dependency injection container.
   */
  async initServer(): Promise<void> {
    this.configureFastifyInstance()
    this.registerFastifyInstance()
    await this.configurePlugins()
  }

  /**
   * Waits for the Fastify server to be ready.
   *
   * This method ensures all plugins are registered and the server is ready
   * to accept connections before starting to listen.
   */
  async ready(): Promise<void> {
    await this.server!.ready()
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
   * Gets the underlying Fastify server instance.
   *
   * This allows direct access to the Fastify instance for advanced use cases,
   * such as registering custom plugins, hooks, or decorators.
   *
   * @returns The Fastify server instance.
   * @throws {Error} If the server has not been initialized yet.
   *
   * @example
   * ```ts
   * const fastify = app.getServer()
   * await fastify.register(require('@fastify/static'), {
   *   root: path.join(__dirname, 'public'),
   * })
   * ```
   */
  getServer(): FastifyInstance {
    if (!this.server) {
      throw new Error('Server is not initialized. Call init() first.')
    }
    return this.server
  }

  async onModulesInit(modules: Map<string, ModuleMetadata>): Promise<void> {
    const promises: PromiseLike<any>[] = []
    for (const [_moduleName, moduleMetadata] of modules) {
      if (
        !moduleMetadata.controllers ||
        moduleMetadata.controllers.size === 0
      ) {
        continue
      }
      promises.push(
        this.server!.register(
          async (instance, _opts) => {
            for (const controller of moduleMetadata.controllers) {
              await this.controllerAdapter.setupController(
                controller,
                instance,
                moduleMetadata,
              )
            }
          },
          {
            prefix: this.globalPrefix,
          },
        ),
      )
    }

    await Promise.all(promises)
  }

  /**
   * Configures Fastify instance with error handlers, validators, and serializers.
   *
   * Sets up:
   * - Global error handler for HttpException and other errors
   * - Not found handler for unmatched routes
   * - Zod-based validator and serializer compilers
   *
   * @private
   */
  configureFastifyInstance(): void {
    this.server!.setErrorHandler(
      (error: unknown, request: FastifyRequest, reply: FastifyReply) => {
        if (error instanceof HttpException) {
          // For HttpException, preserve original response format for backwards compatibility
          return reply.status(error.statusCode).send(error.response)
        } else if (error instanceof ZodError) {
          const errorResponse = this.errorProducer.respond(
            FrameworkError.ValidationError,
            error,
          )
          return reply
            .status(errorResponse.statusCode)
            .type('application/problem+json')
            .send(errorResponse.payload)
        } else {
          this.logger.error(
            `Error occurred: ${error instanceof Error ? error.message : 'Unknown error'} on ${request.url}`,
            error,
          )
          const errorResponse = this.errorProducer.respond(
            FrameworkError.InternalServerError,
            error,
          )
          return reply
            .status(errorResponse.statusCode)
            .type('application/problem+json')
            .send(errorResponse.payload)
        }
      },
    )

    this.server!.setNotFoundHandler(
      (req: FastifyRequest, reply: FastifyReply) => {
        this.logger.warn(`Route not found: [${req.method}] ${req.url}`)
        const errorResponse = this.errorProducer.respond(
          FrameworkError.NotFound,
          null,
          `Route [${req.method}] ${req.url} not found`,
        )
        return reply
          .status(errorResponse.statusCode)
          .type('application/problem+json')
          .send(errorResponse.payload)
      },
    )

    // Add request decoration for scoped container storage between hooks
    this.server!.decorateRequest('scopedContainer', undefined)

    // Global onResponse hook for non-blocking container cleanup
    this.server!.addHook('onResponse', async (request) => {
      if (request.scopedContainer) {
        request.scopedContainer.endRequest().catch((err: any) => {
          this.logger.error(`Error ending request context: ${err.message}`, err)
        })
      }
    })

    // Add schema validator and serializer
    this.server!.setValidatorCompiler(validatorCompiler)
    this.server!.setSerializerCompiler(serializerCompiler)
  }

  /**
   * Configures and registers Fastify plugins (CORS, multipart, etc.).
   *
   * This method registers plugins that were configured via `enableCors()`
   * and `enableMultipart()` methods.
   *
   * @private
   */
  async configurePlugins(): Promise<void> {
    if (this.corsOptions) {
      await this.server!.register(cors, this.corsOptions)
    }

    if (this.multipartOptions) {
      await this.configureMultipart(this.multipartOptions)
    }
  }

  /**
   * Configures multipart form data support.
   *
   * @param options - Multipart configuration options or `true` for defaults.
   * @private
   */
  async configureMultipart(
    options: FastifyMultipartOptions | true,
  ): Promise<void> {
    if (options) {
      await this.server!.register(
        multipart,
        typeof options === 'object' ? options : {},
      )
    }
  }

  /**
   * Registers the Fastify instance in the dependency injection container.
   *
   * Makes the server instance available for injection via `FastifyServerToken`.
   *
   * @private
   */
  registerFastifyInstance(): void {
    this.container.addInstance(FastifyServerToken, this.server!)
  }

  /**
   * Enables CORS (Cross-Origin Resource Sharing) support.
   *
   * Configures CORS headers for all routes. The options are applied when
   * the server is initialized.
   *
   * @param options - CORS configuration options from `@fastify/cors`.
   *
   * @example
   * ```ts
   * app.enableCors({
   *   origin: true, // Allow all origins
   *   methods: ['GET', 'POST', 'PUT', 'DELETE'],
   *   credentials: true,
   * })
   * ```
   *
   * @see {@link https://github.com/fastify/fastify-cors} Fastify CORS plugin documentation
   */
  enableCors(options: FastifyCorsOptions): void {
    this.corsOptions = options
  }

  /**
   * Enables multipart form data support for file uploads.
   *
   * Configures multipart handling for all routes. The options are applied when
   * the server is initialized.
   *
   * @param options - Multipart configuration options from `@fastify/multipart`.
   *
   * @example
   * ```ts
   * app.enableMultipart({
   *   limits: {
   *     fileSize: 10 * 1024 * 1024, // 10MB
   *     files: 5, // Max 5 files
   *   },
   * })
   * ```
   *
   * @see {@link https://github.com/fastify/fastify-multipart} Fastify Multipart plugin documentation
   */
  enableMultipart(options: FastifyMultipartOptions): void {
    this.multipartOptions = options
  }

  /**
   * Starts the Fastify HTTP server and begins listening for incoming requests.
   *
   * This method starts the server with the configured routes and options.
   * The server will handle all registered routes and return 404 for unmatched requests.
   *
   * @param options - Server listen options including port and host.
   * @returns A promise that resolves to the server address string.
   *
   * @example
   * ```ts
   * const address = await app.listen({
   *   port: 3000,
   *   host: '0.0.0.0',
   * })
   * console.log(`Server listening on ${address}`)
   * ```
   */
  async listen(options: FastifyListenOptions): Promise<string> {
    const res = await this.server!.listen(options)
    this.logger.debug(`Navios is listening on ${res}`)
    return res
  }

  /**
   * Gracefully shuts down the Fastify server.
   *
   * This method closes all connections and cleans up resources. Should be called
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
    await this.server!.close()
  }
}
