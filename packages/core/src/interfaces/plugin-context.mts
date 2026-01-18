import type { Container } from '@navios/di'

import type { ModuleMetadata } from '../metadata/index.mjs'
import type { ModuleLoaderService } from '../services/module-loader.service.mjs'

import type { AbstractAdapterInterface } from './abstract-adapter.interface.mjs'
import type { PluginStage } from './plugin-stage.mjs'

/**
 * Container-only context available at early stages.
 * Available at: pre:modules-traverse
 */
export interface ContainerOnlyContext {
  /**
   * The dependency injection container.
   */
  container: Container
}

/**
 * Context with modules loaded.
 * Available at: post:modules-traverse, pre:adapter-resolve
 */
export interface ModulesLoadedContext extends ContainerOnlyContext {
  /**
   * All loaded modules with their metadata.
   * Keys are module class names, values are their metadata.
   */
  modules: Map<string, ModuleMetadata>

  /**
   * Module loader service for extending the module tree.
   * Use `moduleLoader.extendModules()` to add controllers dynamically.
   */
  moduleLoader: ModuleLoaderService
}

/**
 * Full context with adapter available.
 * Available at: post:adapter-resolve and all later stages
 *
 * @typeParam TAdapter - The adapter type, defaults to AbstractAdapterInterface
 */
export interface FullPluginContext<
  TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface,
> extends ModulesLoadedContext {
  /**
   * The current adapter instance.
   * Use type guards or cast to adapter-specific types for HTTP methods.
   */
  adapter: TAdapter
}

/**
 * Maps each plugin stage to its available context type.
 *
 * @typeParam TAdapter - The adapter type for stages that have adapter access
 */
export interface PluginStageContextMap<
  TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface,
> {
  'pre:modules-traverse': ContainerOnlyContext
  'post:modules-traverse': ModulesLoadedContext
  'pre:adapter-resolve': ModulesLoadedContext
  'post:adapter-resolve': FullPluginContext<TAdapter>
  'pre:adapter-setup': FullPluginContext<TAdapter>
  'post:adapter-setup': FullPluginContext<TAdapter>
  'pre:modules-init': FullPluginContext<TAdapter>
  'post:modules-init': FullPluginContext<TAdapter>
  'pre:ready': FullPluginContext<TAdapter>
  'post:ready': FullPluginContext<TAdapter>
}

/**
 * Helper type to get the context type for a specific stage.
 *
 * @typeParam S - The plugin stage
 * @typeParam TAdapter - The adapter type for stages that have adapter access
 *
 * @example
 * ```typescript
 * type MyContext = ContextForStage<'pre:adapter-resolve'>
 * // MyContext is ModulesLoadedContext (no adapter)
 *
 * type FullContext = ContextForStage<'post:modules-init', BunApplicationService>
 * // FullContext has typed adapter
 * ```
 */
export type ContextForStage<
  S extends PluginStage,
  TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface,
> = PluginStageContextMap<TAdapter>[S]

/**
 * Context provided to plugins during registration.
 *
 * @deprecated Use stage-specific context types (ContainerOnlyContext,
 * ModulesLoadedContext, FullPluginContext) for better type safety.
 * This is an alias for FullPluginContext for backward compatibility.
 *
 * @typeParam TAdapter - The adapter type, defaults to AbstractAdapterInterface
 */
export type PluginContext<TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface> =
  FullPluginContext<TAdapter>
