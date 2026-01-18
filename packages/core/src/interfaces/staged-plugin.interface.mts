import type { AbstractAdapterInterface } from './abstract-adapter.interface.mjs'
import type {
  ContainerOnlyContext,
  ContextForStage,
  FullPluginContext,
  ModulesLoadedContext,
} from './plugin-context.mjs'
import type { PluginStage } from './plugin-stage.mjs'

/**
 * Base interface for staged plugins that target a specific lifecycle stage.
 *
 * @typeParam S - The target stage (e.g., 'pre:adapter-resolve')
 * @typeParam TOptions - Plugin options type
 * @typeParam TAdapter - Adapter type (only relevant for post-adapter stages)
 *
 * @example
 * ```typescript
 * const myPlugin: StagedPlugin<'pre:adapter-resolve', MyOptions> = {
 *   name: 'my-plugin',
 *   stage: 'pre:adapter-resolve',
 *   register: (context, options) => {
 *     // context is typed as ModulesLoadedContext
 *   },
 * }
 * ```
 */
export interface StagedPlugin<
  S extends PluginStage,
  TOptions = unknown,
  TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface,
> {
  /**
   * Plugin name for identification and logging.
   */
  readonly name: string

  /**
   * The lifecycle stage this plugin targets.
   */
  readonly stage: S

  /**
   * Called at the specified stage during application initialization.
   *
   * @param context - Stage-appropriate context
   * @param options - Plugin-specific configuration options
   */
  register(context: ContextForStage<S, TAdapter>, options: TOptions): Promise<void> | void
}

// ============ Convenience Type Aliases for Each Stage ============

/**
 * Plugin that runs before module tree traversal.
 * Context: container only
 */
export interface PreModulesTraversePlugin<TOptions = unknown> extends StagedPlugin<
  'pre:modules-traverse',
  TOptions,
  never
> {
  register(context: ContainerOnlyContext, options: TOptions): Promise<void> | void
}

/**
 * Plugin that runs after module tree traversal.
 * Context: container + modules + moduleLoader
 */
export interface PostModulesTraversePlugin<TOptions = unknown> extends StagedPlugin<
  'post:modules-traverse',
  TOptions,
  never
> {
  register(context: ModulesLoadedContext, options: TOptions): Promise<void> | void
}

/**
 * Plugin that runs before adapter is resolved from container.
 * Context: container + modules + moduleLoader (NO adapter yet!)
 *
 * Use this stage to modify registry/bindings before adapter instantiation.
 */
export interface PreAdapterResolvePlugin<TOptions = unknown> extends StagedPlugin<
  'pre:adapter-resolve',
  TOptions,
  never
> {
  register(context: ModulesLoadedContext, options: TOptions): Promise<void> | void
}

/**
 * Plugin that runs after adapter is resolved.
 * Context: full (container + modules + moduleLoader + adapter)
 */
export interface PostAdapterResolvePlugin<
  TOptions = unknown,
  TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface,
> extends StagedPlugin<'post:adapter-resolve', TOptions, TAdapter> {
  register(context: FullPluginContext<TAdapter>, options: TOptions): Promise<void> | void
}

/**
 * Plugin that runs before adapter setup.
 * Context: full
 */
export interface PreAdapterSetupPlugin<
  TOptions = unknown,
  TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface,
> extends StagedPlugin<'pre:adapter-setup', TOptions, TAdapter> {
  register(context: FullPluginContext<TAdapter>, options: TOptions): Promise<void> | void
}

/**
 * Plugin that runs after adapter setup.
 * Context: full
 */
export interface PostAdapterSetupPlugin<
  TOptions = unknown,
  TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface,
> extends StagedPlugin<'post:adapter-setup', TOptions, TAdapter> {
  register(context: FullPluginContext<TAdapter>, options: TOptions): Promise<void> | void
}

/**
 * Plugin that runs before modules init (route registration).
 * Context: full
 */
export interface PreModulesInitPlugin<
  TOptions = unknown,
  TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface,
> extends StagedPlugin<'pre:modules-init', TOptions, TAdapter> {
  register(context: FullPluginContext<TAdapter>, options: TOptions): Promise<void> | void
}

/**
 * Plugin that runs after modules init (route registration).
 * Context: full
 *
 * This is the default stage for legacy NaviosPlugin implementations.
 */
export interface PostModulesInitPlugin<
  TOptions = unknown,
  TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface,
> extends StagedPlugin<'post:modules-init', TOptions, TAdapter> {
  register(context: FullPluginContext<TAdapter>, options: TOptions): Promise<void> | void
}

/**
 * Plugin that runs before adapter signals ready.
 * Context: full
 */
export interface PreReadyPlugin<
  TOptions = unknown,
  TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface,
> extends StagedPlugin<'pre:ready', TOptions, TAdapter> {
  register(context: FullPluginContext<TAdapter>, options: TOptions): Promise<void> | void
}

/**
 * Plugin that runs after adapter signals ready.
 * Context: full - this is the final stage, app is fully initialized
 */
export interface PostReadyPlugin<
  TOptions = unknown,
  TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface,
> extends StagedPlugin<'post:ready', TOptions, TAdapter> {
  register(context: FullPluginContext<TAdapter>, options: TOptions): Promise<void> | void
}

// ============ Plugin Definition Types ============

/**
 * Plugin definition for staged plugins.
 *
 * @typeParam S - The target stage
 * @typeParam TOptions - Plugin options type
 * @typeParam TAdapter - Adapter type
 */
export interface StagedPluginDefinition<
  S extends PluginStage = PluginStage,
  TOptions = unknown,
  TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface,
> {
  /**
   * The staged plugin instance.
   */
  plugin: StagedPlugin<S, TOptions, TAdapter>

  /**
   * Options to pass to the plugin's register function.
   */
  options: TOptions
}
