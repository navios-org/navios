import type { ClassType, Container, InjectionToken, ProviderInput } from '@navios/di'

import type { Transport, TransportFactory } from '../transports/transport.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * What a plugin can do. Each call is declarative: the application applies it
 * at the right point of `init()`.
 */
export interface PluginApi {
  readonly container: Container
  /** Replaces or supplies a provider. */
  provide<T>(token: ClassType | InjectionToken<T, any>, impl: ProviderInput<T>): void
  /** Wraps every instance of a service after it is built. */
  decorate<T>(token: ClassType | InjectionToken<T, any>, decorator: (instance: T) => T): void
  /** Adds an interceptor around every handler, on every transport. */
  intercept(interceptor: ClassType): void
  /** Adds a module, and so its handlers, to the application. */
  addModule(module: ClassType): void
  /**
   * One of the application's transports, already created, or `undefined`
   * when the application has none of this kind. What only one transport
   * offers is reached through it.
   */
  transport<T extends Transport>(
    factory: TransportFactory<any, T>,
    instanceName?: string,
  ): T | undefined
  /** Runs after every transport is set up and before any starts. */
  onBootstrap(hook: () => void | Promise<void>): void
  /** Runs when the application closes, in reverse registration order. */
  onShutdown(hook: (signal?: string) => void | Promise<void>): void
}

export interface PluginDefinition<Options = void> {
  /** Unique name. A plugin registered twice under one name is applied once. */
  name: string
  /** Names of plugins that must be set up before this one. */
  dependsOn?: string[]
  setup(api: PluginApi, options: Options): void | Promise<void>
}

export interface PluginInstance {
  readonly definition: PluginDefinition<any>
  readonly options: unknown
}

/**
 * Defines a plugin.
 *
 * ```ts
 * export const tracing = definePlugin({
 *   name: 'tracing',
 *   setup(api, options: { serviceName: string }) {
 *     api.intercept(TracingInterceptor)
 *     api.onShutdown(() => flush())
 *   },
 * })
 *
 * app.usePlugin(tracing({ serviceName: 'api' }))
 * ```
 */
export function definePlugin<Options = void>(
  definition: PluginDefinition<Options>,
): (options: Options) => PluginInstance {
  return (options) => ({ definition, options })
}
