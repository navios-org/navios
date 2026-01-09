import type {
  ClassType,
  ClassTypeWithArgument,
  ClassTypeWithInstance,
  InjectionTokenSchemaType,
  Registry,
} from '@navios/di'
import type { z } from 'zod/v4'

import {
  BoundInjectionToken,
  Container,
  FactoryInjectionToken,
  inject,
  Injectable,
  InjectionToken,
} from '@navios/di'

import type {
  AbstractAdapterInterface,
  AdapterEnvironment,
  DefaultAdapterEnvironment,
  HttpAdapterEnvironment,
  NaviosModule,
  PluginContext,
  PluginDefinition,
} from './interfaces/index.mjs'
import type { LoggerService, LogLevel } from './logger/index.mjs'
import type { NaviosEnvironmentOptions } from './navios.environment.mjs'

import { Logger } from './logger/index.mjs'
import { NaviosEnvironment } from './navios.environment.mjs'
import { ModuleLoaderService } from './services/index.mjs'
import { AdapterToken } from './tokens/index.mjs'
import { assertAdapterSupports } from './utils/index.mjs'

/**
 * Options for configuring the Navios application context.
 * These options control the application configuration.
 */
export interface NaviosApplicationOptions {
  /**
   * Specifies the logger to use. Pass `false` to turn off logging.
   *
   * - `LoggerService` instance: Use a custom logger implementation
   * - `LogLevel[]`: Enable specific log levels (e.g., ['error', 'warn', 'log'])
   * - `false`: Disable logging completely
   */
  logger?: LoggerService | LogLevel[] | false

  /**
   * Specifies a custom registry to use. Useful for testing.
   * If not provided, a new Registry will be created.
   */
  registry?: Registry

  /**
   * Specifies a custom container to use. Useful for testing.
   * If not provided, a new Container will be created.
   */
  container?: Container

  /**
   * Adapter environment(s) to use for the application.
   * Can be a single adapter or an array of adapters.
   *
   * @example
   * ```typescript
   * adapter: defineFastifyEnvironment()
   * // or
   * adapter: [defineFastifyEnvironment()]
   * ```
   */
  adapter: NaviosEnvironmentOptions | NaviosEnvironmentOptions[]

  /**
   * Whether to validate response schemas.
   * When `false`, response schema validation is skipped for better performance.
   * @default true
   */
  validateResponses?: boolean

  /**
   * Whether to enable request ID propagation via AsyncLocalStorage.
   * When `true`, request IDs are available via `getRequestId()` throughout the request.
   * @default false
   */
  enableRequestId?: boolean
}

/**
 * Main application class for Navios.
 *
 * This class represents a Navios application instance and provides methods
 * for initializing, configuring, and managing the application lifecycle.
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
export class NaviosApplication<
  Environment extends AdapterEnvironment = DefaultAdapterEnvironment,
> {
  private environment = inject(NaviosEnvironment)
  private moduleLoader = inject(ModuleLoaderService)
  private adapter: Environment['adapter'] | null = null
  private logger = inject(Logger, {
    context: NaviosApplication.name,
  })
  protected container = inject(Container)

  private appModule: ClassTypeWithInstance<NaviosModule> | null = null
  private options: NaviosApplicationOptions = {
    adapter: [],
  }
  private plugins: PluginDefinition<any, any>[] = []

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
    if (this.environment.hasAdapterSetup()) {
      this.adapter = (await this.container.get(
        AdapterToken,
      )) as Environment['adapter']
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
   * Returns the current adapter instance.
   *
   * @returns The adapter instance
   * @throws Error if adapter is not initialized
   */
  getAdapter(): Environment['adapter'] {
    if (!this.adapter) {
      throw new Error('Adapter not initialized')
    }
    return this.adapter
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
  usePlugin<TOptions, TAdapter extends AbstractAdapterInterface>(
    definition: PluginDefinition<TOptions, TAdapter>,
  ): this {
    this.plugins.push(definition)
    return this
  }

  /**
   * Initializes the application.
   *
   * This method:
   * - Loads all modules and their dependencies
   * - Sets up the adapter if one is configured
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

    if (this.environment.hasAdapterSetup() && this.adapter) {
      await this.adapter.setupAdapter(this.options)
    }

    await this.initPlugins()
    await this.initModules()

    if (this.adapter) {
      await this.adapter.ready()
    }

    this.isInitialized = true
    this.logger.debug('Navios application initialized')
  }

  private async initModules() {
    const modules = this.moduleLoader.getAllModules()
    if (this.adapter) {
      await this.adapter.onModulesInit(modules)
    }
  }

  private async initPlugins() {
    if (this.plugins.length === 0) return

    if (!this.adapter) {
      throw new Error('Cannot initialize plugins without an adapter')
    }

    const context: PluginContext = {
      modules: this.moduleLoader.getAllModules(),
      adapter: this.adapter,
      container: this.container,
      moduleLoader: this.moduleLoader,
    }

    for (const { plugin, options } of this.plugins) {
      this.logger.debug(`Initializing plugin: ${plugin.name}`)
      await plugin.register(context, options)
    }
  }

  /**
   * Gets a service instance from the dependency injection container.
   *
   * This is a shorthand for `app.getContainer().get(token)`.
   *
   * @param token - The injection token or class to resolve
   * @returns Promise resolving to the service instance
   *
   * @example
   * ```typescript
   * const userService = await app.get(UserService)
   * const config = await app.get(ConfigToken)
   * ```
   */
  get<T extends ClassType>(token: T): Promise<InstanceType<T>>
  get<T extends ClassTypeWithArgument<R>, R>(
    token: T,
    args: R,
  ): Promise<InstanceType<T>>
  get<T, S extends InjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    args: z.input<S>,
  ): Promise<T>
  get<T, S extends InjectionTokenSchemaType, R extends boolean>(
    token: InjectionToken<T, S, R>,
  ): Promise<T>
  get<T>(token: InjectionToken<T, undefined>): Promise<T>
  get<T>(token: BoundInjectionToken<T, any>): Promise<T>
  get<T>(token: FactoryInjectionToken<T, any>): Promise<T>
  async get(
    token:
      | ClassType
      | InjectionToken<any>
      | BoundInjectionToken<any, any>
      | FactoryInjectionToken<any, any>,
    args?: unknown,
  ): Promise<any> {
    return this.container.get(token as any, args)
  }

  /**
   * Configures the adapter with additional options before initialization.
   *
   * This method allows setting adapter-specific configuration options
   * before the adapter is initialized. Must be called before `init()`.
   *
   * @param options - Adapter-specific configuration options
   * @returns this for method chaining
   * @throws Error if called after init() or if adapter doesn't support configure
   *
   * @example
   * ```typescript
   * // With Fastify adapter
   * app.configure({ trustProxy: true, logger: true })
   *
   * // With Bun adapter
   * app.configure({ development: true })
   * ```
   */
  configure(options: Partial<Environment['options']>): this {
    if (this.isInitialized) {
      throw new Error('configure() must be called before init()')
    }
    assertAdapterSupports(this.adapter, 'configure')
    this.adapter.configure(options)
    return this
  }

  /**
   * Enables CORS (Cross-Origin Resource Sharing) for the application.
   *
   * @param options - CORS configuration options (adapter-specific)
   * @throws Error if adapter doesn't support enableCors
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
  enableCors(
    options: Environment extends HttpAdapterEnvironment
      ? Environment['corsOptions']
      : never,
  ): void {
    assertAdapterSupports(this.adapter, 'enableCors')
    this.adapter.enableCors(options)
  }

  /**
   * Enables multipart/form-data support for file uploads.
   *
   * @param options - Multipart configuration options (adapter-specific)
   * @throws Error if adapter doesn't support enableMultipart
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
  enableMultipart(
    options: Environment extends HttpAdapterEnvironment
      ? Environment['multipartOptions']
      : never,
  ): void {
    assertAdapterSupports(this.adapter, 'enableMultipart')
    this.adapter.enableMultipart(options)
  }

  /**
   * Sets a global prefix for all routes.
   *
   * @param prefix - The prefix to prepend to all route URLs (e.g., '/api')
   * @throws Error if adapter doesn't support setGlobalPrefix
   *
   * @example
   * ```typescript
   * app.setGlobalPrefix('/api/v1')
   * // All routes will be prefixed with /api/v1
   * ```
   */
  setGlobalPrefix(prefix: string): void {
    assertAdapterSupports(this.adapter, 'setGlobalPrefix')
    this.adapter.setGlobalPrefix(prefix)
  }

  /**
   * Gets the underlying HTTP server instance.
   *
   * The type of the returned server depends on the adapter used:
   * - Fastify adapter: Returns FastifyInstance
   * - Bun adapter: Returns Bun.Server
   *
   * @returns The HTTP server instance
   * @throws Error if adapter doesn't support getServer
   *
   * @example
   * ```typescript
   * const server = app.getServer()
   * // Use adapter-specific server methods
   * ```
   */
  getServer(): Environment extends HttpAdapterEnvironment
    ? Environment['server']
    : never {
    assertAdapterSupports(this.adapter, 'getServer')
    return this.adapter.getServer() as Environment extends HttpAdapterEnvironment
      ? Environment['server']
      : never
  }

  /**
   * Starts the HTTP server and begins listening for requests.
   *
   * @param options - Listen options (port, host, etc.)
   * @throws Error if adapter doesn't support listen
   *
   * @example
   * ```typescript
   * await app.listen({ port: 3000, host: '0.0.0.0' })
   * ```
   */
  async listen(
    options: Environment extends HttpAdapterEnvironment
      ? Environment['listenOptions']
      : never,
  ): Promise<string> {
    assertAdapterSupports(this.adapter, 'listen')
    return this.adapter.listen(options) as Promise<string>
  }

  /**
   * Disposes of application resources.
   *
   * Cleans up the adapter and module loader.
   * This method is called automatically by `close()`.
   */
  async dispose() {
    if (this.adapter) {
      await this.adapter.dispose()
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
