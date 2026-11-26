import type { ClassType, Container } from '@navios/di'

import type { InterceptorClass } from '../interceptors/interceptor.mjs'

import type { PluginApi } from './plugin.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A shutdown hook, and the plugin that registered it. */
export interface PluginShutdownHook {
  readonly plugin: string
  readonly run: (signal?: string) => void | Promise<void>
}

/** What the APIs of an application's plugins act on. */
export interface PluginApiTarget {
  readonly container: Container
  /** Whether the plugins are being set up: the API works only then, but for `container` and `transport()`. */
  isSettingUp(): boolean
  /** Supplies what a plugin provides, unless the application provides its own. */
  provide(plugin: string, target: any, impl: any): void
  readonly interceptors: InterceptorClass[]
  readonly modules: ClassType[]
  readonly bootstrapHooks: Array<() => void | Promise<void>>
  readonly shutdownHooks: PluginShutdownHook[]
  readonly transport: PluginApi['transport']
}

/** The API that the `setup` of one plugin is given. */
export function createPluginApi(plugin: string, target: PluginApiTarget): PluginApi {
  const assertSetup = (call: string) => {
    if (!target.isSettingUp()) {
      throw new Error(`[Navios] api.${call}() must be called during setup`)
    }
  }
  return {
    container: target.container,
    provide: ((provided: any, impl: any) => {
      assertSetup('provide')
      target.provide(plugin, provided, impl)
    }) as Container['provide'],
    decorate: ((decorated: any, decorator: any) => {
      assertSetup('decorate')
      target.container.decorate(decorated, decorator)
    }) as Container['decorate'],
    intercept: (interceptor) => {
      assertSetup('intercept')
      target.interceptors.push(interceptor)
    },
    addModule: (module) => {
      assertSetup('addModule')
      target.modules.push(module)
    },
    transport: target.transport,
    onBootstrap: (hook) => {
      assertSetup('onBootstrap')
      target.bootstrapHooks.push(hook)
    },
    onShutdown: (hook) => {
      assertSetup('onShutdown')
      target.shutdownHooks.push({ plugin, run: hook })
    },
  }
}
