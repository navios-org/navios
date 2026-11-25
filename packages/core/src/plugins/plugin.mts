import type { ClassType, Container, InjectionToken, ProviderInput } from '@navios/di'

import type { HttpAdapter } from '../adapter/http-adapter.mjs'
import type { ErrorClass, ErrorMapper } from '../errors/error-pipeline.mjs'
import type { ResponseEncoder } from '../pipeline/response-encoder.mjs'
import type { RouteInfo } from '../routing/route-info.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * What a plugin can do. Each call is declarative: the application applies it
 * at the right point of `init()`.
 */
export interface PluginApi {
  readonly container: Container
  /** The application's adapter, already created. */
  readonly adapter: HttpAdapter
  /** Replaces or supplies a provider. */
  provide<T>(token: ClassType | InjectionToken<T, any>, impl: ProviderInput<T>): void
  /** Wraps every instance of a service after it is built. */
  decorate<T>(token: ClassType | InjectionToken<T, any>, decorator: (instance: T) => T): void
  /** Adds an interceptor around every route. */
  intercept(interceptor: ClassType): void
  /** Maps an error class to a response. */
  mapError<E>(errorClass: ErrorClass<E>, mapper: ErrorMapper<E>): void
  /** Adds a module, and so its routes, to the application. */
  addModule(module: ClassType): void
  /** Registers an encoder for a custom response kind. */
  encoder(kind: string, encoder: ResponseEncoder): void
  /** Runs after routes are compiled and before the server listens. */
  onBootstrap(hook: (routes: readonly RouteInfo[]) => void | Promise<void>): void
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
