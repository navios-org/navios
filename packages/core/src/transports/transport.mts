import type { ClassType, Container } from '@navios/di'

import type { ContextHost } from '../execution/context-host.mjs'
import type { LoggerService } from '../logger/logger-output.mjs'
import type { ModuleNode } from '../modules/module-graph.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * What the application gives a transport when it creates it.
 */
export interface TransportHost {
  readonly container: Container
  readonly logger: LoggerService
  /** For the transport's execution contexts. */
  readonly contextHost: ContextHost
  /** Whether the application keeps the current context in an async store. */
  readonly asyncContext: boolean
  /**
   * Interceptors around every handler of the application, outermost first.
   * Complete once `setup()` is called.
   */
  readonly interceptors: readonly ClassType[]
}

/**
 * One way work reaches the application: an HTTP server, a queue consumer, a
 * command line. The application creates it, hands it the module graph, and
 * starts and stops it together with the others.
 */
export interface Transport {
  /**
   * Reads the module graph and prepares the transport's handlers. Must not
   * start accepting work.
   */
  setup(graph: readonly ModuleNode[]): void | Promise<void>
  /** Starts accepting work. Called at most once. */
  start?(): void | Promise<void>
  /** Stops accepting work and waits, up to `timeoutMs`, for what is in flight. */
  stop(timeoutMs: number): void | Promise<void>
}

export interface TransportDefinition<Options, T extends Transport> {
  /** The kind of transport, and the default name of an instance. */
  name: string
  create(host: TransportHost, options: Options): T | Promise<T>
}

/**
 * A transport as it is listed in an application's options.
 */
export interface TransportInstance<T extends Transport = Transport> {
  readonly definition: TransportDefinition<any, T>
  readonly options: unknown
  /** Unique within the application. Defaults to the definition's name. */
  readonly instanceName: string
}

/**
 * What `defineTransport` returns: called with options it gives the instance
 * to list in an application, and it is the key to look the transport up with.
 */
export interface TransportFactory<Options, T extends Transport> {
  (options: Options, instanceName?: string): TransportInstance<T>
  readonly definition: TransportDefinition<Options, T>
}

/**
 * Defines a transport.
 *
 * ```ts
 * export const queueTransport = defineTransport({
 *   name: 'queue',
 *   create(host, options: { url: string }) {
 *     return new QueueTransport(host, options)
 *   },
 * })
 *
 * const app = createApplication(AppModule, {
 *   transports: [queueTransport({ url })],
 * })
 * await app.start()
 * app.transport(queueTransport) // the QueueTransport
 * ```
 *
 * An application can hold several transports of one definition when each has
 * its own name: `queueTransport({ url }, 'orders')`.
 */
export function defineTransport<Options = void, T extends Transport = Transport>(
  definition: TransportDefinition<Options, T>,
): TransportFactory<Options, T> {
  const factory = (options: Options, instanceName?: string): TransportInstance<T> => ({
    definition,
    options,
    instanceName: instanceName ?? definition.name,
  })
  return Object.assign(factory, { definition })
}
