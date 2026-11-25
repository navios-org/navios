import type { ClassType, Container } from '@navios/di'

import type { InterceptorClass } from '../interceptors/interceptor.mjs'
import type { OptionsArgument } from '../internal/options-argument.mjs'
import type { Transport, TransportFactory } from '../transports/transport.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * What a plugin can do. Everything but `transport()` and `container` belongs
 * into `setup`: afterwards it throws, because it could not take effect.
 * `provide` and `decorate` apply at once, the rest at its point of `init()`.
 */
export interface PluginApi {
  readonly container: Container
  /**
   * Supplies a provider. It wins over the providers of modules and over the
   * default of the token. What the application itself provides, with its
   * `providers` option or in its container, stays.
   */
  readonly provide: Container['provide']
  /** Wraps every instance of a service after it is built. */
  readonly decorate: Container['decorate']
  /** Adds an interceptor around every handler, on every transport. */
  intercept(interceptor: InterceptorClass): void
  /**
   * Adds a module, and so its handlers, to the application. What it provides
   * is a default: the modules of the application override it.
   */
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
  /**
   * Unique name. One plugin registered twice with equal options is applied
   * once; anything else under one name is an error.
   */
  name: string
  /** Names of plugins that must be set up before this one. */
  dependsOn?: string[]
  setup(api: PluginApi, options: Options): void | Promise<void>
}

export interface PluginInstance {
  readonly definition: PluginDefinition<any>
  /** `{}` when the plugin was given none. */
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
): (...options: OptionsArgument<Options>) => PluginInstance {
  return (options?: Options) => ({ definition, options: options ?? {} })
}
