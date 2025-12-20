import type { Container } from '@navios/di'

import type { ModuleMetadata } from '../metadata/index.mjs'
import type { ModuleLoaderService } from '../services/module-loader.service.mjs'

/**
 * Context provided to plugins during registration.
 *
 * This context gives plugins access to the application's modules,
 * server instance, DI container, and configuration.
 */
export interface PluginContext {
  /**
   * All loaded modules with their metadata.
   * Keys are module class names, values are their metadata.
   */
  modules: Map<string, ModuleMetadata>

  /**
   * The underlying HTTP server instance.
   * Type depends on the adapter used (Fastify, Bun, etc.)
   */
  server: any

  /**
   * The dependency injection container.
   */
  container: Container

  /**
   * Global route prefix (e.g., '/api/v1').
   * Empty string if no prefix is set.
   */
  globalPrefix: string

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
 *
 * @example
 * ```typescript
 * const myPlugin: NaviosPlugin<{ enabled: boolean }> = {
 *   name: 'my-plugin',
 *   register: async (context, options) => {
 *     if (options.enabled) {
 *       // Register routes, services, etc.
 *     }
 *   },
 * }
 * ```
 */
export interface NaviosPlugin<TOptions = unknown> {
  /**
   * Plugin name for identification and logging.
   */
  name: string

  /**
   * Called after modules are loaded but before the server starts listening.
   *
   * @param context - The plugin context with access to modules and server
   * @param options - Plugin-specific configuration options
   */
  register(context: PluginContext, options: TOptions): Promise<void> | void
}

/**
 * Plugin definition combining a plugin with its options.
 *
 * This is the type returned by plugin factory functions like `defineOpenApiPlugin()`.
 *
 * @typeParam TOptions - The type of options the plugin accepts
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
export interface PluginDefinition<TOptions = unknown> {
  /**
   * The plugin instance.
   */
  plugin: NaviosPlugin<TOptions>

  /**
   * Options to pass to the plugin's register function.
   */
  options: TOptions
}
