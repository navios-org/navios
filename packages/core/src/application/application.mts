import { Container } from '@navios/di'
import { constructedInstances, setErrorReporter } from '@navios/di/internal'

import type { ClassType } from '@navios/di'

import { enableAsyncContext } from '../execution/async-context.mjs'
import { createContextHost } from '../execution/context-host.mjs'
import { Logger } from '../logger/logger.mjs'
import { buildModuleGraph } from '../modules/module-graph.mjs'
import { orderPlugins } from '../plugins/order-plugins.mjs'
import { createPluginApi } from '../plugins/plugin-api.mjs'
import { MAX_DELAY_MS, settledWithin } from '../transports/settled-within.mjs'

import type { InterceptorClass } from '../interceptors/interceptor.mjs'
import type { LoggerInstance } from '../logger/logger.mjs'
import type { PluginApiTarget, PluginShutdownHook } from '../plugins/plugin-api.mjs'
import type { PluginInstance } from '../plugins/plugin.mjs'
import type {
  Transport,
  TransportFactory,
  TransportHost,
  TransportInstance,
} from '../transports/transport.mjs'

import { ApplicationLog } from './application-log.mjs'
import { declaresHook } from './lifecycle-hooks.mjs'
import { currentPhase, outsideSteps, runStep } from './lifecycle-step.mjs'
import { ProviderPrecedence } from './provider-precedence.mjs'
import { closeOnSignals, stopListening } from './shutdown-signals.mjs'

import type { ApplicationOptions } from './application-options.mjs'
import type {
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleInit,
} from './lifecycle-hooks.mjs'
import type { ShutdownHooksOptions } from './shutdown-signals.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * How much longer than the time it was given a transport may take to stop. It
 * has things to release once the work in flight is done, or was cut off.
 */
const STOP_GRACE_MS = 3000

/** The containers that back an application which has not been closed. */
const backing = new WeakSet<Container>()

function ignore(): void {}

function closedError(): Error {
  return new Error('[Navios] The application is closed.')
}

/** What a call returns that its caller must not wait for, and need not handle. */
function refused(message: string): Promise<never> {
  const rejected = Promise.reject(new Error(`[Navios] ${message}`))
  rejected.catch(ignore)
  return rejected
}

function className(instance: unknown): string {
  try {
    return String(Object.getPrototypeOf(instance)?.constructor?.name)
  } catch {
    return 'an object'
  }
}

interface TransportSlot {
  readonly instance: TransportInstance
  transport: Transport | null
  stopped: boolean
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
  private readonly globalInterceptors: InterceptorClass[] = []
  private readonly bootstrapHooks: Array<() => void | Promise<void>> = []
  private readonly shutdownHooks: PluginShutdownHook[] = []
  private readonly logOutput: ApplicationLog
  private readonly precedence: ProviderPrecedence
  private transportsCreated = false
  private initialised = false
  private initialisation: Promise<void> | null = null
  private startup: Promise<void> | null = null
  private closing: Promise<void> | null = null
  private tearingDown: Promise<void> | null = null
  private signal: string | undefined

  constructor(
    private readonly appModule: ClassType,
    private readonly applicationOptions: ApplicationOptions = {},
  ) {
    const options = applicationOptions
    if (options.container && backing.has(options.container)) {
      throw new Error(
        '[Navios] This container already backs an open application. Close that one first, or ' +
          'give each application a container of its own.',
      )
    }
    this.container = options.container ?? new Container()
    this.logOutput = new ApplicationLog(this.container, options)
    this.precedence = new ProviderPrecedence(this.container, (message) => this.logNote(message))
    this.precedence.provideOptions(options.providers ?? [], this.logOutput.provider)
    this.plugins = [...(options.plugins ?? [])]
    this.slots = []
    for (const instance of options.transports ?? []) {
      if (this.slots.some((slot) => slot.instance.instanceName === instance.instanceName)) {
        throw new Error(`[Navios] Two transports are named "${instance.instanceName}".`)
      }
      this.slots.push({ instance, transport: null, stopped: false })
    }
    backing.add(this.container)
    setErrorReporter(this.container, (error, description) => this.report(description, error))
  }

  /** Goes to the debug log, or waits for there to be one. */
  private logNote(message: string): void {
    if (this.logger) {
      this.logger.debug(message)
    } else {
      this.logOutput.notes.push(message)
    }
  }

  /** Tells what nobody else receives. Never throws. */
  private report(message: string, error?: unknown): void {
    try {
      if (this.logger) {
        this.logger.error(message, error)
        return
      }
      if (this.logOutput.isOff) {
        return
      }
    } catch {
      // The logger fails as well.
    }
    console.error(`[Navios] ${message}`, ...(error === undefined ? [] : [error]))
  }

  // --------------------------------------------------------------------------
  // Configuration, before init()
  // --------------------------------------------------------------------------

  private assertConfigurable(what: string): void {
    if (this.initialisation !== null) {
      throw new Error(`[Navios] ${what} must be called before init()`)
    }
  }

  usePlugin(plugin: PluginInstance): this {
    this.assertConfigurable('usePlugin()')
    this.plugins.push(plugin)
    return this
  }

  /** Adds an interceptor around every handler, on every transport. */
  intercept(interceptor: InterceptorClass): this {
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
   * called; every caller gets the outcome of that run. Only a hook that the
   * run itself waits for cannot call it.
   *
   * An application that fails to initialise is closed before this rejects, and
   * stays failed, because it is only partly built.
   */
  init(): Promise<this> {
    if (currentPhase(this) === 'init') {
      return refused('init() was called from inside init(), which waits for the caller.')
    }
    const waitsForCaller = currentPhase(this) === 'shutdown' && !this.initialised
    if (this.closed && (this.initialisation === null || waitsForCaller)) {
      return Promise.reject(closedError())
    }
    this.initialisation ??= this.initialise()
    return this.initialisation.then(() => this)
  }

  /** Whether `close()` was called, or a failed start-up took the application down. */
  private get closed(): boolean {
    return this.closing !== null || this.tearingDown !== null
  }

  private assertOpen(): void {
    if (this.closed) {
      throw closedError()
    }
  }

  /**
   * Rejects when the application has been closed, after that shutdown has
   * finished: the process may end when the caller fails.
   */
  protected async assertStillOpen(): Promise<void> {
    await this.closing?.catch(ignore)
    this.assertOpen()
  }

  /** Calls code that the application waits for. */
  private step<T>(phase: 'init' | 'start', fn: () => T | Promise<T>): Promise<T> {
    this.assertNotTornDown()
    return runStep(this, phase, fn)
  }

  /** A shutdown does not wait for a start-up that hangs; that one ends here. */
  private assertNotTornDown(): void {
    if (this.tearingDown !== null) {
      throw closedError()
    }
  }

  private async initialise(): Promise<void> {
    this.logOutput.defer()
    try {
      await this.build()
    } catch (error) {
      await this.tearDownFailed()
      throw error
    } finally {
      this.logOutput.endDeferral()
    }
  }

  /**
   * Nothing may be left half-open when the start-up fails: what was created
   * holds what it acquired, and background work would go on.
   */
  private async tearDownFailed(): Promise<void> {
    try {
      await this.teardown(0)
    } catch (error) {
      this.report('Error disposing the container', error)
    }
  }

  private async build(): Promise<void> {
    const { applicationOptions: options, container } = this

    // The providers of the modules come first: whatever is resolved from here
    // on must already see them.
    let graph = buildModuleGraph([this.appModule])
    const own = new Set(graph.map((node) => node.module))
    this.precedence.provideModules(graph, own, 'before plugins')

    this.logger = await this.step('init', () => container.get(Logger, { context: 'Navios' }))
    for (const note of this.logOutput.notes.splice(0)) {
      this.logger.debug(note)
    }

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
      const { definition, options: transportOptions } = slot.instance
      slot.transport = await this.step('init', () => definition.create(host, transportOptions))
      if (this.tearingDown !== null) {
        // Created too late for the shutdown to see it.
        await this.stopTransport(slot, 0)
      }
    }

    await this.setupPlugins()
    if (this.extraModules.length > 0) {
      // Modules that plugins added are only known now.
      graph = buildModuleGraph([this.appModule, ...this.extraModules])
    }
    this.precedence.provideModules(graph, own, 'after plugins')

    // Everything that may provide the logger has had its turn.
    await this.step('init', () => this.logOutput.settle())

    for (const node of graph) {
      await this.step('init', async () => {
        const instance = await container.get(node.module)
        if (declaresHook(instance, 'onModuleInit')) {
          await (instance as OnModuleInit).onModuleInit()
        }
      })
    }

    for (const slot of this.slots) {
      await this.step('init', () => slot.transport!.setup(graph))
    }

    for (const hook of this.bootstrapHooks) {
      await this.step('init', hook)
    }
    for (const instance of constructedInstances(container)) {
      if (declaresHook(instance, 'onApplicationBootstrap')) {
        await this.step('init', () => (instance as OnApplicationBootstrap).onApplicationBootstrap())
      }
    }
    this.assertNotTornDown()
    this.initialised = true
  }

  private async setupPlugins(): Promise<void> {
    let settingUp = true
    const target: PluginApiTarget = {
      container: this.container,
      isSettingUp: () => settingUp,
      provide: (plugin, provided, impl) => this.precedence.providePlugin(plugin, provided, impl),
      interceptors: this.globalInterceptors,
      modules: this.extraModules,
      bootstrapHooks: this.bootstrapHooks,
      shutdownHooks: this.shutdownHooks,
      transport: (factory, instanceName) => this.findTransport(factory, instanceName),
    }
    try {
      for (const { definition, options } of orderPlugins(this.plugins)) {
        this.logger.debug(`Setting up plugin ${definition.name}`)
        const api = createPluginApi(definition.name, target)
        await this.step('init', () => definition.setup(api, options))
      }
    } finally {
      settingUp = false
    }
  }

  // --------------------------------------------------------------------------
  // Running
  // --------------------------------------------------------------------------

  /**
   * Initialises the application if needed, then starts every transport, in
   * the order they were listed. A transport is started at most once, however
   * often this is called. An application whose transports do not all start is
   * closed before this rejects.
   *
   * Called from something `init()` waits for, it starts the application
   * afterwards and returns a promise that rejects.
   */
  start(): Promise<this> {
    const phase = currentPhase(this)
    if (phase !== 'init' && phase !== 'start') {
      return this.startOnce()
    }
    if (phase === 'init') {
      outsideSteps(() => this.startOnce()).catch((error: unknown) => {
        // Whoever called init() learns why that failed.
        if (this.startup !== null) {
          this.report('Error starting the application', error)
        }
      })
    }
    return refused(
      `start() was called from inside ${phase}(), which waits for the caller.` +
        (phase === 'init' ? ' Call it without waiting for it.' : ''),
    )
  }

  private async startOnce(): Promise<this> {
    await this.init()
    if (this.startup === null) {
      // The application may have been closed while it was initialising.
      await this.assertStillOpen()
      this.startup ??= this.startTransports()
    }
    await this.startup
    return this
  }

  private async startTransports(): Promise<void> {
    try {
      // Runs once: `startup` is never retried.
      for (const slot of this.slots) {
        await this.startTransport(slot)
      }
      this.assertNotTornDown()
    } catch (error) {
      await this.tearDownFailed()
      throw error
    }
  }

  private async startTransport(slot: TransportSlot): Promise<void> {
    try {
      await this.step('start', () => slot.transport!.start?.())
    } finally {
      if (slot.stopped) {
        // The shutdown did not wait any longer, and stopped what had not started.
        slot.stopped = false
        await this.stopTransport(slot, 0)
      }
    }
  }

  /**
   * Closes the application when the process receives one of the signals. Call
   * it before `start()`, so that a signal during the start-up is seen.
   *
   * A signal that has a listener no longer ends the process. When everything
   * the signal closes is closed, the process is therefore sent the signal
   * again, or exits with its code when it is process 1, unless `exit` is
   * `false` or something else listens to it. A second signal does not wait for
   * the shutdown, unlike one during a `close()` that the application called.
   */
  enableShutdownHooks(
    signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'],
    options: ShutdownHooksOptions = {},
  ): this {
    this.assertOpen()
    closeOnSignals(this, signals, {
      exit: options.exit ?? true,
      onError: (signal, error) => this.report(`Error closing the application on ${signal}`, error),
    })
    return this
  }

  /**
   * Shuts down: every transport stops accepting work and waits for what is
   * in flight, shutdown hooks run in reverse order, then the container is
   * disposed, which runs `onServiceDestroy` hooks. Each step gets
   * `shutdownTimeout`; one that takes longer is reported and left behind.
   *
   * Runs once, however often and from wherever it is called, and every caller
   * gets the outcome of that run, with two exceptions, since they would wait
   * for themselves. Called from something the shutdown waits for, it resolves
   * at once. Called from something `init()` or `start()` waits for, it closes
   * the application afterwards and returns a promise that rejects.
   */
  close(signal?: string): Promise<void> {
    const phase = currentPhase(this)
    if (phase === 'shutdown') {
      return Promise.resolve()
    }
    if (this.closing === null) {
      this.signal ??= signal
      // Signals are no longer listened to once it reaches the teardown, which it always does.
      this.closing = this.shutdown()
    }
    if (phase !== null) {
      this.closing.catch((error: unknown) => this.report('Error closing the application', error))
      return refused(
        `close() was called from inside ${phase}(), which waits for the caller. Throw an error ` +
          `instead, or call close() without waiting for it.`,
      )
    }
    return this.closing
  }

  /** Transports are given it, and may add to it, for a timer of theirs. */
  private get shutdownTimeout(): number {
    const { shutdownTimeout = 10_000 } = this.applicationOptions
    return Math.min(shutdownTimeout, MAX_DELAY_MS - 60_000)
  }

  private async shutdown(): Promise<void> {
    // Whatever is still being built or started is let finish first, so that
    // nothing is created or started after it was stopped. Their failures
    // belong to whoever called init() or start().
    for (const [call, pending] of [
      ['init()', this.initialisation],
      ['start()', this.startup],
    ] as const) {
      if (pending !== null) {
        await this.shutdownStep(call, this.shutdownTimeout, () => pending.catch(ignore))
      }
    }
    await this.teardown(this.shutdownTimeout)
  }

  /** Takes down whatever was built so far, once. */
  private teardown(transportTimeout: number): Promise<void> {
    if (this.tearingDown === null) {
      this.tearingDown = this.takeDown(transportTimeout)
      stopListening(this, this.tearingDown)
    }
    return this.tearingDown
  }

  private async takeDown(transportTimeout: number): Promise<void> {
    const { container, shutdownTimeout } = this
    this.logOutput.settleNow()
    try {
      await Promise.all(this.slots.map((slot) => this.stopTransport(slot, transportTimeout)))

      for (const instance of constructedInstances(container).reverse()) {
        if (declaresHook(instance, 'onApplicationShutdown')) {
          const label = `onApplicationShutdown of ${className(instance)}`
          await this.shutdownStep(label, shutdownTimeout, () =>
            (instance as OnApplicationShutdown).onApplicationShutdown(this.signal),
          )
        }
      }
      for (const { plugin, run } of this.shutdownHooks.reverse()) {
        await this.shutdownStep(`onShutdown of plugin ${plugin}`, shutdownTimeout, () =>
          run(this.signal),
        )
      }
      const disposal = runStep(this, 'shutdown', () => container.dispose())
      if (!(await settledWithin(disposal, shutdownTimeout))) {
        this.reportTimeout('disposal of the container', shutdownTimeout)
      }
    } finally {
      backing.delete(container)
    }
  }

  /**
   * Stops a transport that was created, once, however often and from
   * wherever this is asked for.
   */
  private async stopTransport(slot: TransportSlot, timeoutMs: number): Promise<void> {
    const { transport } = slot
    if (transport !== null && !slot.stopped) {
      slot.stopped = true
      const label = `stop of transport ${slot.instance.instanceName}`
      await this.shutdownStep(label, timeoutMs + STOP_GRACE_MS, () => transport.stop(timeoutMs))
    }
  }

  /** Runs one part of the shutdown. Whatever becomes of it, the rest follows. */
  private async shutdownStep(
    label: string,
    timeoutMs: number,
    fn: () => void | Promise<void>,
  ): Promise<void> {
    try {
      if (!(await settledWithin(runStep(this, 'shutdown', fn), timeoutMs))) {
        this.reportTimeout(label, timeoutMs)
      }
    } catch (error) {
      this.report(`Error in shutdown step "${label}"`, error)
    }
  }

  private reportTimeout(label: string, timeoutMs: number): void {
    this.report(`Shutdown step "${label}" did not finish within ${timeoutMs} ms`)
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
