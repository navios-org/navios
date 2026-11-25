import { Container, provide } from '@navios/di'

import type { ClassType, InjectionToken, ProviderInput } from '@navios/di'

import { enableAsyncContext } from '../execution/async-context.mjs'
import { createContextHost } from '../execution/context-host.mjs'
import { ConsoleLogger } from '../logger/console-logger.mjs'
import { LoggerOutput } from '../logger/logger-output.mjs'
import { Logger } from '../logger/logger.mjs'
import { buildModuleGraph } from '../modules/module-graph.mjs'
import { orderPlugins } from '../plugins/order-plugins.mjs'

import type { LoggerService } from '../logger/logger-output.mjs'
import type { LoggerInstance } from '../logger/logger.mjs'
import type { PluginApi, PluginInstance } from '../plugins/plugin.mjs'
import type {
  Transport,
  TransportFactory,
  TransportHost,
  TransportInstance,
} from '../transports/transport.mjs'

import type { ApplicationOptions } from './application-options.mjs'
import type {
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleInit,
} from './lifecycle-hooks.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

const noopLogger: LoggerService = {
  log() {},
  error() {},
  warn() {},
  debug() {},
  verbose() {},
  fatal() {},
}

interface TransportSlot {
  readonly instance: TransportInstance
  transport: Transport | null
  started: boolean
}

/**
 * An application: a module tree, one container, and the transports through
 * which work reaches it.
 *
 * ```ts
 * const app = createApplication(AppModule, {
 *   transports: [queueTransport({ url })],
 * })
 * await app.start()
 * ```
 */
export class Application {
  readonly container: Container
  protected logger!: LoggerInstance
  private readonly plugins: PluginInstance[]
  private readonly slots: TransportSlot[]
  private readonly extraModules: ClassType[] = []
  private readonly globalInterceptors: ClassType[] = []
  private readonly bootstrapHooks: Array<() => void | Promise<void>> = []
  private readonly shutdownHooks: Array<(signal?: string) => void | Promise<void>> = []
  private transportsCreated = false
  private initialised = false
  private initialisation: Promise<void> | null = null
  private startup: Promise<void> | null = null
  private closed = false
  private signalHandlers: Array<[NodeJS.Signals, () => void]> = []

  constructor(
    private readonly appModule: ClassType,
    private readonly applicationOptions: ApplicationOptions = {},
  ) {
    const options = applicationOptions
    this.container = options.container ?? new Container({ providers: options.providers })
    if (options.container && options.providers) {
      for (const provider of options.providers) {
        this.container.overrides.set(provider.token, provider.record)
      }
    }
    this.plugins = [...(options.plugins ?? [])]
    this.slots = []
    for (const instance of options.transports ?? []) {
      if (this.slots.some((slot) => slot.instance.instanceName === instance.instanceName)) {
        throw new Error(`[Navios] Two transports are named "${instance.instanceName}".`)
      }
      this.slots.push({ instance, transport: null, started: false })
    }
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

  /** Adds an interceptor around every handler, on every transport. */
  intercept(interceptor: ClassType): this {
    this.assertConfigurable('intercept()')
    this.globalInterceptors.push(interceptor)
    return this
  }

  // --------------------------------------------------------------------------
  // Access
  // --------------------------------------------------------------------------

  get: Container['get'] = ((token: any, args?: unknown) =>
    (this.container.get as any)(token, args)) as Container['get']

  /**
   * One of the application's transports. Transports are created by `init()`.
   * Throws when the application has no such transport; `findTransport`
   * returns `undefined` instead.
   */
  transport<T extends Transport>(factory: TransportFactory<any, T>, instanceName?: string): T {
    const name = instanceName ?? factory.definition.name
    if (!this.transportsCreated) {
      throw new Error(`[Navios] The "${name}" transport is created by init(); call init() first.`)
    }
    const transport = this.findTransport(factory, instanceName)
    if (transport === undefined) {
      throw new Error(`[Navios] The application has no "${name}" transport.`)
    }
    return transport
  }

  /** Like `transport`, but `undefined` when there is none, or not yet. */
  findTransport<T extends Transport>(
    factory: TransportFactory<any, T>,
    instanceName?: string,
  ): T | undefined {
    const name = instanceName ?? factory.definition.name
    for (const slot of this.slots) {
      if (slot.instance.definition === factory.definition && slot.instance.instanceName === name) {
        return (slot.transport ?? undefined) as T | undefined
      }
    }
    return undefined
  }

  // --------------------------------------------------------------------------
  // Initialisation
  // --------------------------------------------------------------------------

  /**
   * Builds the application: transports, plugins, modules and each
   * transport's handlers. Runs once, however often and from wherever it is
   * called; every caller gets the outcome of that run. An application that
   * failed to initialise stays failed, because it is only partly built.
   */
  async init(): Promise<this> {
    await (this.initialisation ??= this.initialise())
    return this
  }

  private async initialise(): Promise<void> {
    try {
      await this.build()
    } catch (error) {
      // Nothing may be left half-open: a transport that was created holds
      // whatever its `create` acquired.
      await Promise.allSettled(
        this.slots.map(async (slot) => {
          await slot.transport?.stop(0)
        }),
      )
      throw error
    }
  }

  private async build(): Promise<void> {
    const { applicationOptions: options, container } = this

    this.setupLogger()
    this.logger = (await container.get(Logger, { context: 'Navios' })) as LoggerInstance

    if (options.asyncContext) {
      await enableAsyncContext()
    }

    const host: TransportHost = {
      container,
      logger: this.logger,
      contextHost: createContextHost(
        container,
        options.requestScopedServices ?? (process.env.NODE_ENV === 'production' ? 'allow' : 'warn'),
        this.logger,
      ),
      asyncContext: options.asyncContext ?? false,
      interceptors: this.globalInterceptors,
    }
    this.transportsCreated = true
    for (const slot of this.slots) {
      slot.transport = await slot.instance.definition.create(host, slot.instance.options)
    }

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

    for (const slot of this.slots) {
      await slot.transport!.setup(graph)
    }

    for (const hook of this.bootstrapHooks) {
      await hook()
    }
    for (const instance of container.instances() as Partial<OnApplicationBootstrap>[]) {
      if (instance !== null && typeof instance?.onApplicationBootstrap === 'function') {
        await instance.onApplicationBootstrap()
      }
    }
  }

  private setupLogger(): void {
    const { logger } = this.applicationOptions
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
        requestId: this.applicationOptions.asyncContext ?? false,
      })
    }
  }

  private async setupPlugins(): Promise<void> {
    const { container } = this
    const api: PluginApi = {
      container,
      provide: <T,>(token: ClassType | InjectionToken<T, any>, impl: ProviderInput<T>) =>
        container.provide(token, impl),
      decorate: (token, decorator) => (container.decorate as any)(token, decorator),
      intercept: (interceptor) => {
        this.globalInterceptors.push(interceptor)
      },
      addModule: (module) => {
        this.extraModules.push(module)
      },
      transport: (factory, instanceName) => this.findTransport(factory, instanceName),
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

  // --------------------------------------------------------------------------
  // Running
  // --------------------------------------------------------------------------

  /**
   * Initialises the application if needed, then starts every transport, in
   * the order they were listed. A transport is started at most once, however
   * often this is called.
   */
  async start(): Promise<this> {
    await this.init()
    await (this.startup ??= this.startTransports())
    return this
  }

  private async startTransports(): Promise<void> {
    for (const slot of this.slots) {
      if (!slot.started) {
        slot.started = true
        await slot.transport!.start?.()
      }
    }
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
   * Shuts down: every transport stops accepting work and waits for what is
   * in flight, shutdown hooks run in reverse order, then the container is
   * disposed, which runs `onServiceDestroy` hooks.
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

    const report = (message: string, error: unknown) => {
      this.logger?.error(message, error)
    }
    const timeout = this.applicationOptions.shutdownTimeout ?? 10_000
    await Promise.all(
      this.slots.map(async (slot) => {
        try {
          await slot.transport?.stop(timeout)
        } catch (error) {
          report(`Error stopping transport ${slot.instance.instanceName}`, error)
        }
      }),
    )

    const instances = this.container.instances() as Partial<OnApplicationShutdown>[]
    for (let i = instances.length - 1; i >= 0; i--) {
      const instance = instances[i]
      if (instance !== null && typeof instance?.onApplicationShutdown === 'function') {
        try {
          await instance.onApplicationShutdown(signal)
        } catch (error) {
          report('Error in a shutdown hook', error)
        }
      }
    }
    for (let i = this.shutdownHooks.length - 1; i >= 0; i--) {
      try {
        await this.shutdownHooks[i](signal)
      } catch (error) {
        report('Error in a shutdown hook', error)
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

/**
 * Creates an application from its root module. Call `init()` to build it, or
 * `start()` to build it and start its transports.
 */
export function createApplication(appModule: ClassType, options?: ApplicationOptions): Application {
  return new Application(appModule, options)
}
