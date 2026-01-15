import type { AbstractAdapterInterface } from './abstract-adapter.interface.mjs'
import type { FullPluginContext, PluginContext } from './plugin-context.mjs'
import type { PluginStage } from './plugin-stage.mjs'
import type { StagedPluginDefinition } from './staged-plugin.interface.mjs'

// Re-export context types for backward compatibility
export type { PluginContext, FullPluginContext }

/**
 * Base interface for Navios plugins (legacy).
 *
 * @deprecated Use staged plugins with explicit stage property instead.
 * This interface maps to the `post:modules-init` stage.
 * See `StagedPlugin` for the new pattern.
 *
 * Plugins are registered using `app.usePlugin()` and are initialized
 * after all modules are loaded but before the server starts listening.
 *
 * @typeParam TOptions - The type of options the plugin accepts
 * @typeParam TAdapter - The adapter type the plugin requires
 *
 * @example
 * ```typescript
 * // Legacy pattern (still works, maps to post:modules-init)
 * const myPlugin: NaviosPlugin<{ enabled: boolean }> = {
 *   name: 'my-plugin',
 *   register: async (context, options) => {
 *     if (options.enabled) {
 *       // Register routes, services, etc.
 *     }
 *   },
 * }
 *
 * // New pattern (recommended)
 * import { definePostModulesInitPlugin } from '@navios/core'
 *
 * export const defineMyPlugin = definePostModulesInitPlugin()({
 *   name: 'my-plugin',
 *   register: async (context, options: { enabled: boolean }) => {
 *     // ...
 *   },
 * })
 * ```
 */
export interface NaviosPlugin<
  TOptions = unknown,
  TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface,
> {
  /**
   * Plugin name for identification and logging.
   */
  name: string

  /**
   * Called after modules are loaded but before the server starts listening.
   *
   * @param context - The plugin context with access to modules and adapter
   * @param options - Plugin-specific configuration options
   * @deprecated Use staged plugins with explicit stage property
   */
  register(
    context: PluginContext<TAdapter>,
    options: TOptions,
  ): Promise<void> | void
}

/**
 * Plugin definition combining a plugin with its options.
 *
 * @deprecated Use `StagedPluginDefinition` for new plugins.
 * This type is kept for backward compatibility with legacy plugins.
 *
 * @typeParam TOptions - The type of options the plugin accepts
 * @typeParam TAdapter - The adapter type the plugin requires
 *
 * @example
 * ```typescript
 * // Legacy pattern
 * function defineMyPlugin(options: MyPluginOptions): PluginDefinition<MyPluginOptions> {
 *   return {
 *     plugin: myPlugin,
 *     options,
 *   }
 * }
 *
 * // New pattern (recommended)
 * import { definePostModulesInitPlugin } from '@navios/core'
 *
 * export const defineMyPlugin = definePostModulesInitPlugin()({
 *   name: 'my-plugin',
 *   register: (context, options: MyPluginOptions) => { ... },
 * })
 * ```
 */
export interface PluginDefinition<
  TOptions = unknown,
  TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface,
> {
  /**
   * The plugin instance.
   */
  plugin: NaviosPlugin<TOptions, TAdapter>

  /**
   * Options to pass to the plugin's register function.
   */
  options: TOptions
}

/**
 * Union of legacy and staged plugin definitions.
 * Used internally by `usePlugin()` to accept both patterns.
 */
export type AnyPluginDefinition<
  TOptions = unknown,
  TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface,
> =
  | PluginDefinition<TOptions, TAdapter>
  | StagedPluginDefinition<PluginStage, TOptions, TAdapter>
