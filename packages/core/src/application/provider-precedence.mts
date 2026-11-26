import { provide } from '@navios/di'
import { constructedInstances, hasOwnProvider, setProvider } from '@navios/di/internal'

import type { ClassType, Container, InjectionToken, Provider } from '@navios/di'

import { assertProviders } from '../modules/module-metadata.mjs'

import type { ModuleNode } from '../modules/module-graph.mjs'

import { moduleProviders } from './module-providers.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Who provides a token in an application, first to last: the caller, with
 * the application's container (a provider, or an instance put there) and
 * then its options; plugins; modules; the default of the token.
 */
export class ProviderPrecedence {
  /** What modules and plugins provide. Everything else is the caller's. */
  private readonly supplied = new Map<InjectionToken<any, any>, Provider | 'plugin'>()

  constructor(
    private readonly container: Container,
    /** Receives what is worth a line in the debug log. */
    private readonly note: (message: string) => void,
  ) {}

  /**
   * Supplies what the options of the application provide, unless its
   * container does. The last one of several for one token counts, and the
   * `logger` option comes after `providers`.
   */
  provideOptions(providers: readonly Provider[], logger: Provider | undefined): void {
    const given = new Map<InjectionToken<any, any>, [option: string, Provider]>()
    assertProviders('The application', providers)
    for (const provider of providers) {
      given.set(provider.token, ['providers', provider])
    }
    if (logger !== undefined) {
      given.set(logger.token, ['logger', logger])
    }
    for (const [option, provider] of given.values()) {
      this.provideOption(option, provider)
    }
  }

  /** Supplies what a plugin provides with `api.provide()`, unless the caller provides it. */
  providePlugin(plugin: string, target: any, impl: any): void {
    const { token } = provide(target, impl)
    if (this.isProvidedByCaller(token)) {
      this.note(`Plugin ${plugin} provides ${token}, but the application provides its own.`)
      return
    }
    this.container.provide(target, impl)
    this.supplied.set(token, 'plugin')
  }

  /**
   * Supplies what the modules provide, unless the application or a plugin
   * provides it. Modules that disagree about a token are an error where one of
   * them would have to be used, which is settled after the plugins.
   */
  provideModules(
    graph: readonly ModuleNode[],
    own: ReadonlySet<ClassType>,
    when: 'before plugins' | 'after plugins',
  ): void {
    const provided = moduleProviders(graph, (module) => own.has(module))
    for (const [token, { provider, module, rival }] of provided) {
      const supplied = this.supplied.get(token)
      if (supplied === provider || supplied === 'plugin' || this.isProvidedByCaller(token)) {
        continue
      }
      let used = provider
      if (rival !== undefined) {
        const conflict = new Error(
          `[Navios] Modules ${rival.name} and ${module.name} both provide ${token}, and neither ` +
            `imports the other. Provide it in a module that imports both, or with the ` +
            `\`providers\` option of the application.`,
        )
        if (when === 'after plugins') {
          throw conflict
        }
        // Whoever needs the token before a plugin may have decided gets to know.
        used = provide(token, {
          factory: () => {
            throw conflict
          },
        })
      }
      if (!setProvider(this.container, used)) {
        throw new Error(
          `[Navios] ${module.name} provides ${token}, which has already been resolved. Resolve ` +
            `it later, or provide it with the \`providers\` option of the application.`,
        )
      }
      this.supplied.set(token, used)
    }
  }

  /** Supplies what an option provides, unless the given container does. */
  private provideOption(option: string, provider: Provider): void {
    const { token } = provider
    if (this.isProvidedByCaller(token)) {
      this.note(
        `The container provides ${token}, so the one of the \`${option}\` option is not used.`,
      )
    } else if (!setProvider(this.container, provider)) {
      throw new Error(
        `[Navios] \`${option}\` has ${token}, which has already been resolved in \`container\`.`,
      )
    }
  }

  /**
   * Whether the caller provides a token: with the options of the application
   * or in its container, where an instance may also have been put.
   */
  private isProvidedByCaller(token: InjectionToken<any, any>): boolean {
    if (this.supplied.has(token)) {
      return false
    }
    if (hasOwnProvider(this.container, token)) {
      return true
    }
    const instance = this.container.peek(token)
    return instance !== null && !constructedInstances(this.container).includes(instance)
  }
}
