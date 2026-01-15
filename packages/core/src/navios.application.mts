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
  AnyPluginDefinition,
  ContainerOnlyContext,
  DefaultAdapterEnvironment,
  FullPluginContext,
  HttpAdapterEnvironment,
  ModulesLoadedContext,
  NaviosModule,
  PluginStage,
} from './interfaces/index.mjs'
import type { LoggerService, LogLevel } from './logger/index.mjs'
import type { NaviosEnvironmentOptions } from './navios.environment.mjs'

import {
  PLUGIN_STAGES_ORDER,
  PluginStageBase,
  PluginStages,
  postStage,
  preStage,
} from './interfaces/index.mjs'
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

  /**
   * Plugin storage organized by stage for efficient execution.
   * Each stage has a Set of plugin definitions.
   */
  private plugins: Map<PluginStage, Set<AnyPluginDefinition>> = new Map(
    PLUGIN_STAGES_ORDER.map((stage) => [stage, new Set()]),
  )

  /**
   * Queue of adapter configuration methods to apply after adapter resolution.
   * Allows calling methods like enableCors() before init().
   */
  private pendingAdapterCalls: Array<{
    method: string
    args: unknown[]
  }> = []

  /**
   * Indicates whether the application has been initialized.
   * Set to `true` after `init()` completes successfully.
   */
  isInitialized = false

  /**
   * Sets up the application with the provided module and options.
   * This is called automatically by NaviosFactory.create().
   *
   * Note: Adapter resolution has been moved to init() to allow
   * plugins to modify the container/registry before adapter instantiation.
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
    // Note: Adapter resolution moved to init() for plugin hooks
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
   * Registers one or more plugins for initialization during the application lifecycle.
   *
   * Plugins can target specific stages or use the legacy interface (defaults to post:modules-init).
   * Plugins are executed in stage order, and within a stage in registration order.
   *
   * @param definitions - Single plugin definition or array of definitions
   * @returns this for method chaining
   *
   * @example
   * ```typescript
   * // Single plugin (legacy or staged)
   * app.usePlugin(defineOpenApiPlugin({ info: { title: 'My API', version: '1.0.0' } }))
   *
   * // Multiple plugins in one call
   * app.usePlugin([
   *   defineOtelPlugin({ serviceName: 'my-service' }),
   *   defineOpenApiPlugin({ info: { title: 'My API', version: '1.0.0' } }),
   * ])
   *
   * // Staged plugin with explicit stage
   * app.usePlugin(definePreAdapterResolvePlugin({
   *   name: 'early-setup',
   *   register: (ctx) => { ... },
   * })({}))
   * ```
   */
  usePlugin<TOptions, TAdapter extends AbstractAdapterInterface>(
    definitions:
      | AnyPluginDefinition<TOptions, TAdapter>
      | AnyPluginDefinition<TOptions, TAdapter>[],
  ): this {
    const definitionsArray = Array.isArray(definitions)
      ? definitions
      : [definitions]

    for (const definition of definitionsArray) {
      const stage = this.resolvePluginStage(definition)
      const stageSet = this.plugins.get(stage)

      if (!stageSet) {
        throw new Error(`Unknown plugin stage: ${stage}`)
      }

      stageSet.add(definition as AnyPluginDefinition)
      this.logger.debug(
        `Registered plugin "${definition.plugin.name}" for stage: ${stage}`,
      )
    }

    return this
  }

  /**
   * Resolves the stage for a plugin definition.
   * Staged plugins use their explicit stage, legacy plugins default to post:modules-init.
   */
  private resolvePluginStage(definition: AnyPluginDefinition): PluginStage {
    if ('stage' in definition.plugin) {
      return definition.plugin.stage
    }
    // Legacy plugins default to post:modules-init for backward compatibility
    return PluginStages.POST_MODULES_INIT
  }

  /**
   * Initializes the application.
   *
   * This method executes the following lifecycle stages:
   * 1. pre:modules-traverse → Load modules → post:modules-traverse
   * 2. pre:adapter-resolve → Resolve adapter → post:adapter-resolve
   * 3. pre:adapter-setup → Setup adapter → post:adapter-setup
   * 4. pre:modules-init → Initialize modules → post:modules-init
   * 5. pre:ready → Ready signal → post:ready
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

    // Stage 1: Load modules
    await this.wrapStage(PluginStageBase.MODULES_TRAVERSE, () =>
      this.moduleLoader.loadModules(this.appModule!),
    )

    // Stage 2: Resolve adapter (moved from setup())
    // Note: If no adapter configured, adapter stages are silently skipped
    if (this.environment.hasAdapterSetup()) {
      await this.wrapStage(PluginStageBase.ADAPTER_RESOLVE, async () => {
        this.adapter = (await this.container.get(
          AdapterToken,
        )) as Environment['adapter']
        // Apply any configuration calls that were queued before adapter resolution
        this.applyPendingAdapterCalls()
      })

      // Stage 3: Setup adapter
      if (this.adapter) {
        await this.wrapStage(PluginStageBase.ADAPTER_SETUP, () =>
          this.adapter!.setupAdapter(this.options),
        )
      }
    }

    // Stage 4: Initialize modules (always runs)
    await this.wrapStage(PluginStageBase.MODULES_INIT, () => this.initModules())

    // Stage 5: Ready signal
    if (this.adapter) {
      await this.wrapStage(PluginStageBase.READY, () => this.adapter!.ready())
    }

    this.isInitialized = true
    this.logger.debug('Navios application initialized')
  }

  /**
   * Wraps an operation with pre/post plugin stage execution.
   *
   * @param baseName - The base stage name (e.g., 'modules-traverse')
   * @param operation - The operation to execute between pre/post stages
   */
  private async wrapStage<T>(
    baseName: PluginStageBase,
    operation: () => Promise<T> | T,
  ): Promise<T> {
    await this.executePluginStage(preStage(baseName))
    const result = await operation()
    await this.executePluginStage(postStage(baseName))
    return result
  }

  /**
   * Executes all plugins registered for a specific stage.
   *
   * @param stage - The lifecycle stage to execute plugins for
   */
  private async executePluginStage(stage: PluginStage): Promise<void> {
    const stagePlugins = this.plugins.get(stage)

    if (!stagePlugins || stagePlugins.size === 0) {
      return
    }

    const context = this.buildContextForStage(stage)

    this.logger.debug(
      `Executing ${stagePlugins.size} plugin(s) for stage: ${stage}`,
    )

    for (const { plugin, options } of stagePlugins) {
      this.logger.debug(`Executing plugin: ${plugin.name} (stage: ${stage})`)

      try {
        await plugin.register(context as never, options)
      } catch (error) {
        this.logger.error(
          `Plugin "${plugin.name}" failed at stage "${stage}"`,
          error,
        )
        throw error
      }
    }
  }

  /**
   * Builds the appropriate context object for a given stage.
   *
   * @param stage - The lifecycle stage
   * @returns Context object with stage-appropriate properties
   */
  private buildContextForStage(
    stage: PluginStage,
  ): ContainerOnlyContext | ModulesLoadedContext | FullPluginContext {
    const baseContext: ContainerOnlyContext = {
      container: this.container,
    }

    if (stage === PluginStages.PRE_MODULES_TRAVERSE) {
      return baseContext
    }

    const modulesContext: ModulesLoadedContext = {
      ...baseContext,
      modules: this.moduleLoader.getAllModules(),
      moduleLoader: this.moduleLoader,
    }

    const isPreAdapterStage =
      stage === PluginStages.POST_MODULES_TRAVERSE ||
      stage === PluginStages.PRE_ADAPTER_RESOLVE

    if (isPreAdapterStage) {
      return modulesContext
    }

    if (!this.adapter) {
      throw new Error(`Cannot execute stage "${stage}" without adapter`)
    }

    return {
      ...modulesContext,
      adapter: this.adapter,
    } as FullPluginContext
  }

  private async initModules() {
    const modules = this.moduleLoader.getAllModules()
    if (this.adapter) {
      await this.adapter.onModulesInit(modules)
    }
  }

  /**
   * Applies any pending adapter configuration calls that were queued
   * before the adapter was resolved.
   */
  private applyPendingAdapterCalls(): void {
    if (!this.adapter || this.pendingAdapterCalls.length === 0) {
      return
    }

    for (const { method, args } of this.pendingAdapterCalls) {
      assertAdapterSupports(
        this.adapter,
        method as keyof AbstractAdapterInterface,
      )
      ;(this.adapter as Record<string, (...args: unknown[]) => unknown>)[method](
        ...args,
      )
    }

    // Clear the queue after applying
    this.pendingAdapterCalls = []
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
    if (this.adapter) {
      assertAdapterSupports(this.adapter, 'configure')
      this.adapter.configure(options)
    } else {
      this.pendingAdapterCalls.push({ method: 'configure', args: [options] })
    }
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
    if (this.adapter) {
      assertAdapterSupports(this.adapter, 'enableCors')
      this.adapter.enableCors(options)
    } else {
      this.pendingAdapterCalls.push({ method: 'enableCors', args: [options] })
    }
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
    if (this.adapter) {
      assertAdapterSupports(this.adapter, 'enableMultipart')
      this.adapter.enableMultipart(options)
    } else {
      this.pendingAdapterCalls.push({ method: 'enableMultipart', args: [options] })
    }
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
    if (this.adapter) {
      assertAdapterSupports(this.adapter, 'setGlobalPrefix')
      this.adapter.setGlobalPrefix(prefix)
    } else {
      this.pendingAdapterCalls.push({ method: 'setGlobalPrefix', args: [prefix] })
    }
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
