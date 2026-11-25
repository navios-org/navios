import { Container, provide } from '@navios/di'

import type { ClassType, InjectionToken, ProviderInput } from '@navios/di'

import { isRequestValueClass } from '../context/request-value.mjs'
import { useClientErrorStacks } from '../errors/client-error-stacks.mjs'
import { ErrorPipeline } from '../errors/error-pipeline.mjs'
import {
  ForbiddenResponderToken,
  InternalServerErrorResponderToken,
  NotFoundResponderToken,
  ValidationErrorResponderToken,
} from '../errors/error-responders.mjs'
import { enableAsyncContext } from '../execution/async-context.mjs'
import { createContextHost } from '../execution/context-host.mjs'
import { ConsoleLogger } from '../logger/console-logger.mjs'
import { LoggerOutput } from '../logger/logger-output.mjs'
import { Logger } from '../logger/logger.mjs'
import { buildModuleGraph } from '../modules/module-graph.mjs'
import { orderPlugins } from '../plugins/order-plugins.mjs'
import { joinPaths } from '../routing/join-paths.mjs'

import type { HttpAdapter, HttpAdapterEnvironment } from '../adapter/http-adapter.mjs'
import type { TestRequest, TestResponse } from '../adapter/test-request.mjs'
import type { ErrorClass, ErrorMapper } from '../errors/error-pipeline.mjs'
import type { LoggerService } from '../logger/logger-output.mjs'
import type { LoggerInstance } from '../logger/logger.mjs'
import type { ResponseEncoder } from '../pipeline/response-encoder.mjs'
import type { PluginApi, PluginInstance } from '../plugins/plugin.mjs'
import type { CompiledRoute } from '../routing/compiled-route.mjs'
import type { RouteInfo } from '../routing/route-info.mjs'

import { assembleRoutes } from './assemble-routes.mjs'
import { moduleRequestValues } from './http-module-options.mjs'
import { computeModulePrefixes } from './module-prefixes.mjs'

import type {
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleInit,
} from './lifecycle-hooks.mjs'
import type {
  ApplicationEnvironment,
  NaviosApplicationOptions,
} from './navios-application-options.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

const noopLogger: LoggerService = {
  log() {},
  error() {},
  warn() {},
  debug() {},
  verbose() {},
  fatal() {},
}

function tokenName(token: unknown): string {
  return typeof token === 'function' ? token.name : String(token)
}

/**
 * A Navios application: a module tree compiled into routes and bound to an
 * HTTP adapter.
 */
export class NaviosApplication<Env extends HttpAdapterEnvironment = ApplicationEnvironment> {
  readonly container: Container
  private adapterInstance: HttpAdapter<Env> | null = null
  private errors!: ErrorPipeline
  private logger!: LoggerInstance
  private readonly plugins: PluginInstance[]
  private readonly extraModules: ClassType[] = []
  private readonly globalInterceptors: ClassType[] = []
  private readonly pendingMappers: Array<[ErrorClass<any>, ErrorMapper<any>]> = []
  private readonly encoders = new Map<string, ResponseEncoder>()
  private readonly bootstrapHooks: Array<(routes: readonly RouteInfo[]) => void | Promise<void>> =
    []
  private readonly shutdownHooks: Array<(signal?: string) => void | Promise<void>> = []
  private compiledRoutes: CompiledRoute[] = []
  private initialised = false
  private initialisation: Promise<void> | null = null
  private releaseClientErrorStacks: (() => void) | null = null
  private closed = false
  private signalHandlers: Array<[NodeJS.Signals, () => void]> = []

  constructor(
    private readonly appModule: ClassType,
    private readonly options: NaviosApplicationOptions<Env>,
  ) {
    this.container = options.container ?? new Container({ providers: options.providers })
    if (options.container && options.providers) {
      for (const provider of options.providers) {
        this.container.overrides.set(provider.token, provider.record)
      }
    }
    this.plugins = [...(options.plugins ?? [])]
  }

  // --------------------------------------------------------------------------
  // Configuration, before init()
  // --------------------------------------------------------------------------

  private assertConfigurable(what: string): void {
    if (this.initialised) {
      throw new Error(`[Navios] ${what} must be called before init()`)
    }
  }

  usePlugin(plugin: PluginInstance): this {
    this.assertConfigurable('usePlugin()')
    this.plugins.push(plugin)
    return this
  }

  /**
   * Maps an error class to a response. The most specific registered class
   * wins.
   *
   * ```ts
   * app.mapError(UserNotFound, (error) => reply(404, { message: error.message }))
   * ```
   */
  mapError<E>(errorClass: ErrorClass<E>, mapper: ErrorMapper<E>): this {
    if (this.initialised) {
      this.errors.add(errorClass, mapper)
    } else {
      this.pendingMappers.push([errorClass, mapper])
    }
    return this
  }

  /** Adds an interceptor around every route. */
  intercept(interceptor: ClassType): this {
    this.assertConfigurable('intercept()')
    this.globalInterceptors.push(interceptor)
    return this
  }

  // --------------------------------------------------------------------------
  // Access
  // --------------------------------------------------------------------------

  get adapter(): HttpAdapter<Env> {
    if (this.adapterInstance === null) {
      throw new Error('[Navios] The adapter is created by init(); call init() first.')
    }
    return this.adapterInstance
  }

  /** The adapter's native server. */
  getServer(): Env['server'] {
    return this.adapter.server
  }

  get: Container['get'] = ((token: any, args?: unknown) =>
    (this.container.get as any)(token, args)) as Container['get']

  /** Every route of the application. Available after `init()`. */
  routes(): readonly RouteInfo[] {
    return this.compiledRoutes.map((route) => route.info)
  }

  // --------------------------------------------------------------------------
  // Initialisation
  // --------------------------------------------------------------------------

  /**
   * Builds the application: plugins, modules, controllers and routes. Runs
   * once, however often and from wherever it is called; every caller gets the
   * outcome of that run. An application that failed to initialise stays
   * failed, because it is only partly built.
   */
  async init(): Promise<this> {
    await (this.initialisation ??= this.start())
    return this
  }

  private async start(): Promise<void> {
    this.releaseClientErrorStacks = useClientErrorStacks(
      this.options.clientErrorStacks ?? 'development',
    )
    try {
      await this.initialise()
    } catch (error) {
      this.releaseClientErrorStacks()
      throw error
    }
  }

  private async initialise(): Promise<void> {
    const { options, container } = this

    this.setupLogger()
    this.logger = (await container.get(Logger, { context: 'Navios' })) as LoggerInstance

    if (options.asyncContext) {
      await enableAsyncContext()
    }

    this.errors = new ErrorPipeline({
      notFound: await container.get(NotFoundResponderToken),
      forbidden: await container.get(ForbiddenResponderToken),
      validation: await container.get(ValidationErrorResponderToken),
      internal: await container.get(InternalServerErrorResponderToken),
      exposeErrorDetails: options.exposeErrorDetails ?? false,
      checkDeclaredErrors: process.env.NODE_ENV !== 'production',
      onUnhandled: (error, ctx) => {
        this.logger.error(
          ctx ? `Unhandled error in ${ctx.method} ${ctx.path}` : 'Unhandled error',
          error,
        )
      },
    })
    for (const [errorClass, mapper] of this.pendingMappers) {
      this.errors.add(errorClass, mapper)
    }

    const globalPrefix = joinPaths(options.globalPrefix ?? '')
    this.adapterInstance = await options.adapter.create({
      container,
      logger: this.logger,
      errors: this.errors,
      globalPrefix,
    })

    await this.setupPlugins()
    this.initialised = true

    const graph = buildModuleGraph([this.appModule, ...this.extraModules])
    for (const node of graph) {
      for (const provider of node.providers) {
        if (!container.overrides.has(provider.token)) {
          container.overrides.set(provider.token, provider.record)
        }
      }
    }
    for (const node of graph) {
      const instance = (await container.get(node.module)) as Partial<OnModuleInit>
      if (typeof instance.onModuleInit === 'function') {
        await instance.onModuleInit()
      }
    }

    for (const node of graph) {
      for (const requestValue of moduleRequestValues(node)) {
        if (!isRequestValueClass(requestValue)) {
          throw new Error(
            `[Navios] Module ${node.module.name} lists ${tokenName(requestValue)} in requestValues, ` +
              `but ${tokenName(requestValue)} is not a request value. Decorate it with @RequestValue().`,
          )
        }
        await container.get(requestValue)
      }
    }

    this.compiledRoutes = await assembleRoutes(graph, {
      container,
      prefixes: computeModulePrefixes(graph, globalPrefix),
      globalInterceptors: this.globalInterceptors,
      compile: {
        host: createContextHost(
          container,
          options.requestScopedServices ??
            (process.env.NODE_ENV === 'production' ? 'allow' : 'warn'),
          this.logger,
        ),
        errors: this.errors,
        validateResponses: this.resolveValidateResponses(),
        asyncContext: options.asyncContext ?? false,
        encoders: this.encoders,
      },
    })
    for (const route of this.compiledRoutes) {
      this.adapterInstance.register(route)
    }
    this.adapterInstance.setNotFound((input) =>
      this.errors.notFound(`Route [${input.method}] ${input.path} not found`),
    )
    await this.adapterInstance.ready()

    const routes = this.routes()
    for (const hook of this.bootstrapHooks) {
      await hook(routes)
    }
    for (const instance of container.instances() as Partial<OnApplicationBootstrap>[]) {
      if (instance !== null && typeof instance?.onApplicationBootstrap === 'function') {
        await instance.onApplicationBootstrap()
      }
    }

    this.logger.debug(`Navios application initialised with ${routes.length} route(s)`)
  }

  private setupLogger(): void {
    const { logger } = this.options
    const { container } = this
    if (logger === false) {
      container.overrides.set(LoggerOutput, provide(LoggerOutput, { value: noopLogger }).record)
      return
    }
    if (logger !== undefined && !Array.isArray(logger)) {
      container.overrides.set(LoggerOutput, provide(LoggerOutput, { value: logger }).record)
      return
    }
    const provider = container.getProvider(LoggerOutput)
    if (provider?.target === ConsoleLogger) {
      const output = container.getSync(LoggerOutput) as ConsoleLogger
      output.setup({
        logLevels: Array.isArray(logger) ? logger : undefined,
        requestId: this.options.asyncContext ?? false,
      })
    }
  }

  private async setupPlugins(): Promise<void> {
    const { container } = this
    const api: PluginApi = {
      container,
      adapter: this.adapterInstance as unknown as HttpAdapter,
      provide: <T,>(token: ClassType | InjectionToken<T, any>, impl: ProviderInput<T>) =>
        container.provide(token, impl),
      decorate: (token, decorator) => (container.decorate as any)(token, decorator),
      intercept: (interceptor) => {
        this.globalInterceptors.push(interceptor)
      },
      mapError: (errorClass, mapper) => this.errors.add(errorClass, mapper),
      addModule: (module) => {
        this.extraModules.push(module)
      },
      encoder: (kind, encoder) => {
        this.encoders.set(kind, encoder)
      },
      onBootstrap: (hook) => {
        this.bootstrapHooks.push(hook)
      },
      onShutdown: (hook) => {
        this.shutdownHooks.push(hook)
      },
    }
    for (const plugin of orderPlugins(this.plugins)) {
      this.logger.debug(`Setting up plugin ${plugin.definition.name}`)
      await plugin.definition.setup(api, plugin.options)
    }
  }

  private resolveValidateResponses(): boolean {
    switch (this.options.validateResponses ?? 'always') {
      case 'never':
        return false
      case 'development':
        return process.env.NODE_ENV !== 'production'
      default:
        return true
    }
  }

  // --------------------------------------------------------------------------
  // Running
  // --------------------------------------------------------------------------

  async listen(options: Env['listenOptions']): Promise<string> {
    await this.init()
    const address = await this.adapter.listen(options)
    this.logger.log(`Navios is listening on ${address}`)
    return address
  }

  /**
   * Handles a request in process, without a socket. Initialises the
   * application if needed.
   */
  async inject(request: TestRequest): Promise<TestResponse> {
    await this.init()
    return this.adapter.inject(request)
  }

  /**
   * Closes the application when the process receives one of the signals.
   */
  enableShutdownHooks(signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT']): this {
    for (const signal of signals) {
      const handler = () => {
        void this.close(signal)
      }
      process.once(signal, handler)
      this.signalHandlers.push([signal, handler])
    }
    return this
  }

  /**
   * Shuts down: stops accepting connections and waits for in-flight
   * requests, runs shutdown hooks in reverse order, then disposes the
   * container, which runs `onServiceDestroy` hooks.
   */
  async close(signal?: string): Promise<void> {
    if (this.closed) {
      return
    }
    this.closed = true
    for (const [name, handler] of this.signalHandlers) {
      process.off(name, handler)
    }
    this.signalHandlers = []

    try {
      if (this.adapterInstance !== null) {
        await this.adapterInstance.close(this.options.shutdownTimeout ?? 10_000)
      }
    } finally {
      this.releaseClientErrorStacks?.()
    }

    const report = (error: unknown) => {
      this.logger?.error('Error in a shutdown hook', error)
    }
    const instances = this.container.instances() as Partial<OnApplicationShutdown>[]
    for (let i = instances.length - 1; i >= 0; i--) {
      const instance = instances[i]
      if (instance !== null && typeof instance?.onApplicationShutdown === 'function') {
        try {
          await instance.onApplicationShutdown(signal)
        } catch (error) {
          report(error)
        }
      }
    }
    for (let i = this.shutdownHooks.length - 1; i >= 0; i--) {
      try {
        await this.shutdownHooks[i](signal)
      } catch (error) {
        report(error)
      }
    }
    await this.container.dispose()
  }

  /** Alias of `close()`. */
  dispose(): Promise<void> {
    return this.close()
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close()
  }
}
