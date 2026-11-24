import { Container, provide } from '@navios/di'

import type { ClassType, InjectionToken, Provider, ProviderInput } from '@navios/di'

import { enableAsyncContext } from '../context/async-context.mjs'
import { isFieldHandler } from '../decorators/handler.mjs'
import { ErrorPipeline } from '../errors/error-pipeline.mjs'
import {
  ForbiddenResponderToken,
  InternalServerErrorResponderToken,
  NotFoundResponderToken,
  ValidationErrorResponderToken,
} from '../errors/problem.mjs'
import { ConsoleLogger } from '../logger/console-logger.service.mjs'
import { Logger, LoggerOutput } from '../logger/logger.tokens.mjs'
import { getControllerMetadata } from '../metadata/metadata.mjs'
import { compileRoute } from '../routing/compile-route.mjs'

import type {
  AdapterDefinition,
  HttpAdapter,
  HttpAdapterEnvironment,
  TestRequest,
  TestResponse,
} from '../adapter/http-adapter.mjs'
import type { ContextHost, RegisteredEnvironment } from '../context/request-context.mjs'
import type { ErrorClass, ErrorMapper } from '../errors/error-pipeline.mjs'
import type { LogLevel } from '../logger/log-levels.mjs'
import type { LoggerService } from '../logger/logger-service.interface.mjs'
import type { LoggerInstance } from '../logger/logger.service.mjs'
import type { ControllerMetadata } from '../metadata/metadata.mjs'
import type { Guard, Interceptor, RouteDefinition } from '../routing/compile-route.mjs'
import type {
  CompiledRoute,
  RouteEndpointConfig,
  RouteExecutor,
  RouteInfo,
  RouteResult,
} from '../routing/types.mjs'

import { buildModuleGraph, joinPaths } from './module-graph.mjs'
import { orderPlugins } from './plugin.mjs'

import type { ModuleNode } from './module-graph.mjs'
import type { PluginApi, PluginInstance, ResponseEncoder } from './plugin.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

type ApplicationEnvironment = RegisteredEnvironment extends HttpAdapterEnvironment
  ? RegisteredEnvironment
  : HttpAdapterEnvironment

export interface NaviosApplicationOptions<
  Env extends HttpAdapterEnvironment = ApplicationEnvironment,
> {
  adapter: AdapterDefinition<Env>
  /** Providers that replace or supply defaults, application-wide. */
  providers?: Provider[]
  plugins?: PluginInstance[]
  /** Use an existing container instead of creating one. */
  container?: Container
  /**
   * `false` disables logging, an array selects the console logger's levels,
   * and an object is used as the logger.
   */
  logger?: LoggerService | LogLevel[] | false
  /** Prefix for every route. */
  globalPrefix?: string
  /**
   * When handler results are validated against the declared schema.
   * `'development'` validates unless `NODE_ENV` is `production`.
   * @default 'always'
   */
  validateResponses?: 'always' | 'development' | 'never'
  /** Send the message of unexpected errors to the client. @default false */
  exposeErrorDetails?: boolean
  /**
   * Keep the current `RequestContext` in an `AsyncLocalStorage`, so that
   * `currentContext()` works in code that cannot receive it as an argument.
   * @default false
   */
  asyncContext?: boolean
  /**
   * What happens the first time a handler uses a request-scoped service
   * through `ctx.use()` / `ctx.resolve()`. Request values are the cheaper
   * home for per-request data.
   * @default 'warn' outside production, 'allow' in production
   */
  requestScopedServices?: 'allow' | 'warn' | 'forbid'
  /** How long `close()` waits for in-flight requests, in milliseconds. @default 10000 */
  shutdownTimeout?: number
}

export interface OnModuleInit {
  onModuleInit(): void | Promise<void>
}

export interface OnApplicationBootstrap {
  onApplicationBootstrap(): void | Promise<void>
}

export interface OnApplicationShutdown {
  onApplicationShutdown(signal?: string): void | Promise<void>
}

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

  async init(): Promise<this> {
    if (this.initialised) {
      return this
    }
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

    const graph = buildModuleGraph([this.appModule, ...this.extraModules], globalPrefix)
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

    this.compiledRoutes = await this.compileRoutes(graph)
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
    return this
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

  private createContextHost(): ContextHost {
    const mode =
      this.options.requestScopedServices ??
      (process.env.NODE_ENV === 'production' ? 'allow' : 'warn')
    if (mode === 'allow') {
      return { container: this.container, onScopedUse: null }
    }
    const seen = new Set<unknown>()
    return {
      container: this.container,
      onScopedUse: (token) => {
        if (mode === 'forbid') {
          throw new Error(
            `[Navios] ${tokenName(token)} was requested with ctx.use()/ctx.resolve(), but this ` +
              `application forbids request-scoped services (requestScopedServices: 'forbid'). ` +
              `Use a request value (@RequestValue) instead.`,
          )
        }
        if (!seen.has(token)) {
          seen.add(token)
          this.logger.warn(
            `${tokenName(token)} is resolved per request with ctx.use()/ctx.resolve(). ` +
              `If it only carries data derived from the request, a request value (@RequestValue) ` +
              `is cheaper and needs no DI scope. Set requestScopedServices: 'allow' to silence this.`,
          )
        }
      },
    }
  }

  private async instances<T>(classes: ClassType[], kind: string, method: string): Promise<T[]> {
    const result: T[] = []
    for (const cls of classes) {
      const instance = (await this.container.get(cls)) as any
      if (typeof instance?.[method] !== 'function') {
        throw new Error(`[Navios] ${kind} ${cls.name} does not implement ${method}()`)
      }
      result.push(instance)
    }
    return result
  }

  private async compileRoutes(graph: ModuleNode[]): Promise<CompiledRoute[]> {
    const host = this.createContextHost()
    const validateResponses = this.resolveValidateResponses()
    const compiled: CompiledRoute[] = []
    const taken = new Map<string, string>()

    for (const node of graph) {
      for (const controllerClass of node.controllers) {
        const metadata = getControllerMetadata(controllerClass)
        const controller = (await this.container.get(controllerClass)) as Record<string, unknown>

        for (const draft of this.collectHandlers(controllerClass, metadata, controller)) {
          const guards = unique([...node.guards, ...metadata.guards, ...draft.guards])
          const interceptors = unique([
            ...this.globalInterceptors,
            ...node.interceptors,
            ...metadata.interceptors,
            ...draft.interceptors,
          ])
          const path = joinPaths(node.prefix, draft.config.url) || '/'
          const where = `${controllerClass.name}.${draft.name}`
          const key = `${draft.config.method} ${path.replace(/\$[^/]+/g, '$')}`
          const existing = taken.get(key)
          if (existing) {
            throw new Error(
              `[Navios] ${draft.config.method} ${path} is served by both ${existing} and ${where}.`,
            )
          }
          taken.set(key, where)

          const info: RouteInfo = {
            method: draft.config.method,
            path,
            endpoint: draft.config,
            module: node.module,
            controller: controllerClass,
            handlerName: draft.name,
            guards,
            interceptors,
            attributes: {
              handler: draft.attributes,
              controller: metadata.attributes,
              module: node.attributes,
            },
          }
          const definition: RouteDefinition = {
            info,
            invoke: draft.invoke,
            guards: await this.instances<Guard>(guards, 'Guard', 'canActivate'),
            interceptors: await this.instances<Interceptor>(
              interceptors,
              'Interceptor',
              'intercept',
            ),
          }
          let execute = compileRoute(definition, {
            host,
            errors: this.errors,
            validateResponses,
            asyncContext: this.options.asyncContext ?? false,
          })
          execute = this.withEncoders(execute)
          compiled.push({ info, execute })
        }
      }
    }
    return compiled
  }

  private withEncoders(execute: RouteExecutor): RouteExecutor {
    if (this.encoders.size === 0) {
      return execute
    }
    const encoders = this.encoders
    const encode = (result: RouteResult): RouteResult | Promise<RouteResult> => {
      const encoder = encoders.get(result.kind)
      return encoder ? encoder(result) : result
    }
    return (input) => {
      const result = execute(input)
      return result instanceof Promise ? result.then(encode) : encode(result)
    }
  }

  private collectHandlers(
    controllerClass: ClassType,
    metadata: ControllerMetadata,
    controller: Record<string, unknown>,
  ): HandlerDraft[] {
    const drafts: HandlerDraft[] = []
    const seen = new Set<string>()

    // Field form: handler() values on the instance.
    for (const name of Object.keys(controller)) {
      const value = controller[name]
      if (!isFieldHandler(value)) {
        continue
      }
      seen.add(name)
      const extras = metadata.members.get(name)
      const attributes = new Map(extras?.attributes)
      for (const application of value.options.attributes ?? []) {
        attributes.set(application.token, application.value)
      }
      drafts.push({
        name,
        config: value.config as unknown as RouteEndpointConfig,
        invoke: value.invoke as RouteDefinition['invoke'],
        guards: [...(extras?.guards ?? []), ...(value.options.guards ?? [])],
        interceptors: [...(extras?.interceptors ?? []), ...(value.options.interceptors ?? [])],
        attributes,
      })
    }

    // Method form: @Endpoint on a method.
    for (const [name, member] of metadata.members) {
      if (seen.has(name)) {
        continue
      }
      if (member.config === null) {
        throw new Error(
          `[Navios] ${controllerClass.name}.${name} has guards, interceptors or attributes but ` +
            `is not a handler. Add @Endpoint(...) or define it with handler(...).`,
        )
      }
      const method = controller[name]
      if (typeof method !== 'function') {
        throw new Error(`[Navios] ${controllerClass.name}.${name} is not a method`)
      }
      drafts.push({
        name,
        config: member.config,
        invoke: method.bind(controller) as RouteDefinition['invoke'],
        guards: member.guards,
        interceptors: member.interceptors,
        attributes: member.attributes,
      })
    }
    return drafts
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

    if (this.adapterInstance !== null) {
      await this.adapterInstance.close(this.options.shutdownTimeout ?? 10_000)
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

interface HandlerDraft {
  name: string
  config: RouteEndpointConfig
  invoke: RouteDefinition['invoke']
  guards: ClassType[]
  interceptors: ClassType[]
  attributes: Map<symbol, unknown>
}

function unique<T>(list: T[]): T[] {
  return Array.from(new Set(list))
}
