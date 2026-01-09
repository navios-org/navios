import type { Container } from '@navios/di'

import type { ModuleMetadata } from '../metadata/index.mjs'
import type { ModuleLoaderService } from '../services/module-loader.service.mjs'
import type { AbstractAdapterInterface } from './abstract-adapter.interface.mjs'

/**
 * Context provided to plugins during registration.
 *
 * This context gives plugins access to the application's modules,
 * adapter instance, DI container, and module loader.
 *
 * @typeParam TAdapter - The adapter type, defaults to AbstractAdapterInterface
 *
 * @example
 * ```typescript
 * // Generic plugin that works with any adapter
 * async register(context: PluginContext) {
 *   const modules = context.modules
 *   // ...
 * }
 *
 * // Adapter-specific plugin with typed adapter
 * async register(context: PluginContext<BunApplicationService>) {
 *   const server = context.adapter.getServer() // Typed as Bun.Server
 *   // ...
 * }
 * ```
 */
export interface PluginContext<
  TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface,
> {
  /**
   * All loaded modules with their metadata.
   * Keys are module class names, values are their metadata.
   */
  modules: Map<string, ModuleMetadata>

  /**
   * The current adapter instance.
   * Use type guards or cast to adapter-specific types for HTTP methods.
   */
  adapter: TAdapter

  /**
   * The dependency injection container.
   */
  container: Container

  /**
   * Module loader service for extending the module tree.
   * Use `moduleLoader.extendModules()` to add controllers dynamically.
   */
  moduleLoader: ModuleLoaderService
}

/**
 * Base interface for Navios plugins.
 *
 * Plugins are registered using `app.usePlugin()` and are initialized
 * after all modules are loaded but before the server starts listening.
 *
 * @typeParam TOptions - The type of options the plugin accepts
 * @typeParam TAdapter - The adapter type the plugin requires
 *
 * @example
 * ```typescript
 * // Generic plugin
 * const myPlugin: NaviosPlugin<{ enabled: boolean }> = {
 *   name: 'my-plugin',
 *   register: async (context, options) => {
 *     if (options.enabled) {
 *       // Register routes, services, etc.
 *     }
 *   },
 * }
 *
 * // Adapter-specific plugin
 * const fastifyPlugin: NaviosPlugin<Options, FastifyApplicationService> = {
 *   name: 'fastify-plugin',
 *   register: async (context, options) => {
 *     const fastify = context.adapter.getServer() // Typed!
 *   },
 * }
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
   */
  register(
    context: PluginContext<TAdapter>,
    options: TOptions,
  ): Promise<void> | void
}

/**
 * Plugin definition combining a plugin with its options.
 *
 * This is the type returned by plugin factory functions like `defineOpenApiPlugin()`.
 *
 * @typeParam TOptions - The type of options the plugin accepts
 * @typeParam TAdapter - The adapter type the plugin requires
 *
 * @example
 * ```typescript
 * function defineMyPlugin(options: MyPluginOptions): PluginDefinition<MyPluginOptions> {
 *   return {
 *     plugin: myPlugin,
 *     options,
 *   }
 * }
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
