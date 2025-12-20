import type { ClassTypeWithInstance } from '@navios/di'

import { Container, inject, Injectable } from '@navios/di'

import type {
  AbstractHttpAdapterInterface,
  AbstractHttpListenOptions,
  NaviosModule,
  PluginContext,
  PluginDefinition,
} from './interfaces/index.mjs'
import type { LoggerService, LogLevel } from './logger/index.mjs'
import type { NaviosEnvironmentOptions } from './navios.environment.mjs'

import { HttpAdapterToken } from './index.mjs'
import { Logger } from './logger/index.mjs'
import { NaviosEnvironment } from './navios.environment.mjs'
import { ModuleLoaderService } from './services/index.mjs'

/**
 * Options for configuring the Navios application context.
 * These options control dependency injection and logging behavior.
 */
export interface NaviosApplicationContextOptions {
  /**
   * Specifies the logger to use. Pass `false` to turn off logging.
   *
   * - `LoggerService` instance: Use a custom logger implementation
   * - `LogLevel[]`: Enable specific log levels (e.g., ['error', 'warn', 'log'])
   * - `false`: Disable logging completely
   */
  logger?: LoggerService | LogLevel[] | false

  /**
   * Specifies a custom container to use. Useful for testing.
   * If not provided, a new Container will be created.
   */
  container?: Container
}

/**
 * Complete options for creating a Navios application.
 * Extends NaviosApplicationContextOptions with adapter configuration.
 */
export interface NaviosApplicationOptions extends NaviosApplicationContextOptions {
  /**
   * HTTP adapter environment(s) to use for the application.
   * Can be a single adapter or an array of adapters.
   *
   * @example
   * ```typescript
   * adapter: defineFastifyEnvironment()
   * // or
   * adapter: [defineFastifyEnvironment(), defineBunEnvironment()]
   * ```
   */
  adapter: NaviosEnvironmentOptions | NaviosEnvironmentOptions[]
}

/**
 * Main application class for Navios.
 *
 * This class represents a Navios application instance and provides methods
 * for initializing, configuring, and managing the HTTP server.
 *
 * @example
 * ```typescript
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineFastifyEnvironment(),
 * })
 *
 * app.setGlobalPrefix('/api')
 * app.enableCors({ origin: ['http://localhost:3000'] })
 * await app.init()
 * await app.listen({ port: 3000, host: '0.0.0.0' })
 * ```
 */
@Injectable()
export class NaviosApplication {
  private environment = inject(NaviosEnvironment)
  private moduleLoader = inject(ModuleLoaderService)
  private httpApplication: AbstractHttpAdapterInterface<any> | null = null
  private logger = inject(Logger, {
    context: NaviosApplication.name,
  })
  protected container = inject(Container)

  private appModule: ClassTypeWithInstance<NaviosModule> | null = null
  private options: NaviosApplicationOptions = {
    adapter: [],
  }
  private plugins: PluginDefinition<any>[] = []

  /**
   * Indicates whether the application has been initialized.
   * Set to `true` after `init()` completes successfully.
   */
  isInitialized = false

  /**
   * Sets up the application with the provided module and options.
   * This is called automatically by NaviosFactory.create().
   *
   * @param appModule - The root application module
   * @param options - Application configuration options
   * @internal
   */
  async setup(
    appModule: ClassTypeWithInstance<NaviosModule>,
    options: NaviosApplicationOptions = {
      adapter: [],
    },
  ) {
    this.appModule = appModule
    this.options = options
    if (this.environment.hasHttpSetup()) {
      this.httpApplication = await this.container.get(HttpAdapterToken)
    }
  }

  /**
   * Gets the dependency injection container used by this application.
   *
   * @returns The Container instance
   */
  getContainer() {
    return this.container
  }

  /**
   * Registers a plugin to be initialized after modules are loaded.
   *
   * Plugins are initialized in the order they are registered,
   * after all modules are loaded but before the server starts listening.
   *
   * @param definition - Plugin definition with options
   * @returns this for method chaining
   *
   * @example
   * ```typescript
   * import { defineOpenApiPlugin } from '@navios/openapi-fastify'
   *
   * app.usePlugin(defineOpenApiPlugin({
   *   info: { title: 'My API', version: '1.0.0' },
   * }))
   * ```
   */
  usePlugin<TOptions>(definition: PluginDefinition<TOptions>): this {
    this.plugins.push(definition)
    return this
  }

  /**
   * Initializes the application.
   *
   * This method:
   * - Loads all modules and their dependencies
   * - Sets up the HTTP server if an adapter is configured
   * - Calls onModuleInit hooks on all modules
   * - Initializes registered plugins
   * - Marks the application as initialized
   *
   * Must be called before `listen()`.
   *
   * @throws Error if app module is not set
   *
   * @example
   * ```typescript
   * const app = await NaviosFactory.create(AppModule, {
   *   adapter: defineFastifyEnvironment(),
   * })
   * await app.init()
   * await app.listen({ port: 3000 })
   * ```
   */
  async init() {
    if (!this.appModule) {
      throw new Error('App module is not set. Call setAppModule() first.')
    }
    await this.moduleLoader.loadModules(this.appModule)
    if (this.environment.hasHttpSetup()) {
      await this.httpApplication?.setupHttpServer(this.options)
    }
    await this.initPlugins()
    await this.initModules()
    if (this.environment.hasHttpSetup()) {
      await this.httpApplication?.ready()
    }

    this.isInitialized = true
    this.logger.debug('Navios application initialized')
  }

  private async initModules() {
    const modules = this.moduleLoader.getAllModules()
    await this.httpApplication?.onModulesInit(modules)
  }

  private async initPlugins() {
    if (this.plugins.length === 0) return

    let server: any = null
    try {
      server = this.httpApplication?.getServer() ?? null
    } catch {
      // ignore
    }
    const context: PluginContext = {
      modules: this.moduleLoader.getAllModules(),
      server,
      container: this.container,
      globalPrefix: this.httpApplication?.getGlobalPrefix() ?? '',
      moduleLoader: this.moduleLoader,
    }

    for (const { plugin, options } of this.plugins) {
      this.logger.debug(`Initializing plugin: ${plugin.name}`)
      await plugin.register(context, options)
    }
  }

  /**
   * Enables CORS (Cross-Origin Resource Sharing) for the application.
   *
   * @param options - CORS configuration options (adapter-specific)
   * @throws Error if HTTP application is not set
   *
   * @example
   * ```typescript
   * app.enableCors({
   *   origin: ['http://localhost:3000', 'https://example.com'],
   *   methods: ['GET', 'POST', 'PUT', 'DELETE'],
   *   credentials: true,
   * })
   * ```
   */
  enableCors(options: any) {
    if (!this.httpApplication) {
      throw new Error('HTTP application is not set')
    }
    this.httpApplication.enableCors(options)
  }

  /**
   * Enables multipart/form-data support for file uploads.
   *
   * @param options - Multipart configuration options (adapter-specific)
   * @throws Error if HTTP application is not set
   *
   * @example
   * ```typescript
   * app.enableMultipart({
   *   limits: {
   *     fileSize: 1024 * 1024 * 10, // 10MB
   *   },
   * })
   * ```
   */
  enableMultipart(options: any) {
    if (!this.httpApplication) {
      throw new Error('HTTP application is not set')
    }
    this.httpApplication.enableMultipart(options)
  }

  /**
   * Sets a global prefix for all routes.
   *
   * @param prefix - The prefix to prepend to all route URLs (e.g., '/api')
   * @throws Error if HTTP application is not set
   *
   * @example
   * ```typescript
   * app.setGlobalPrefix('/api/v1')
   * // All routes will be prefixed with /api/v1
   * ```
   */
  setGlobalPrefix(prefix: string) {
    if (!this.httpApplication) {
      throw new Error('HTTP application is not set')
    }
    this.httpApplication.setGlobalPrefix(prefix)
  }

  /**
   * Gets the underlying HTTP server instance.
   *
   * The type of the returned server depends on the adapter used:
   * - Fastify adapter: Returns FastifyInstance
   * - Bun adapter: Returns Bun.Server
   *
   * @returns The HTTP server instance
   * @throws Error if HTTP application is not set
   *
   * @example
   * ```typescript
   * const server = app.getServer()
   * // Use adapter-specific server methods
   * ```
   */
  getServer() {
    if (!this.httpApplication) {
      throw new Error('HTTP application is not set')
    }
    return this.httpApplication.getServer()
  }

  /**
   * Starts the HTTP server and begins listening for requests.
   *
   * @param options - Listen options (port, host, etc.)
   * @throws Error if HTTP application is not set
   *
   * @example
   * ```typescript
   * await app.listen({ port: 3000, host: '0.0.0.0' })
   * ```
   */
  async listen(options: AbstractHttpListenOptions) {
    if (!this.httpApplication) {
      throw new Error('HTTP application is not set')
    }
    await this.httpApplication.listen(options)
  }

  /**
   * Disposes of application resources.
   *
   * Cleans up the HTTP server and module loader.
   * This method is called automatically by `close()`.
   */
  async dispose() {
    if (this.httpApplication) {
      await this.httpApplication.dispose()
    }
    if (this.moduleLoader) {
      this.moduleLoader.dispose()
    }
  }

  /**
   * Closes the application and cleans up all resources.
   *
   * This is an alias for `dispose()`.
   *
   * @example
   * ```typescript
   * // Graceful shutdown
   * process.on('SIGTERM', async () => {
   *   await app.close()
   *   process.exit(0)
   * })
   * ```
   */
  async close() {
    await this.dispose()
  }
}
