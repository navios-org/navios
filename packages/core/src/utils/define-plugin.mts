import { PluginStages } from '../interfaces/plugin-stage.mjs'

import type { AbstractAdapterInterface } from '../interfaces/abstract-adapter.interface.mjs'
import type {
  ContainerOnlyContext,
  FullPluginContext,
  ModulesLoadedContext,
} from '../interfaces/plugin-context.mjs'
import type { PluginStage } from '../interfaces/plugin-stage.mjs'
import type { StagedPluginDefinition } from '../interfaces/staged-plugin.interface.mjs'

// ============ Plugin Config Type ============

interface PluginConfig<TContext, TOptions> {
  name: string
  register: (context: TContext, options: TOptions) => Promise<void> | void
}

// ============ Internal Factory Creator ============

/**
 * Creates a curried plugin factory for a specific stage.
 * Returns a function that takes config and returns a function that takes options.
 */
function createPluginFactory<TStage extends PluginStage, TContext>(stage: TStage) {
  return <TOptions, TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface>(
    config: PluginConfig<TContext, TOptions>,
  ) =>
    (options: TOptions): StagedPluginDefinition<TStage, TOptions, TAdapter> => ({
      plugin: {
        name: config.name,
        stage,
        register: config.register as (context: never, options: TOptions) => Promise<void> | void,
      },
      options,
    })
}

// ============ Pre-Adapter Stages (No adapter in context) ============

/**
 * Define a plugin that runs before modules are traversed.
 *
 * Context: container only
 *
 * Use this stage for early DI setup before any modules are loaded.
 *
 * @example
 * ```typescript
 * export const defineEarlySetupPlugin = definePreModulesTraversePlugin({
 *   name: 'early-setup',
 *   register: (context, options: { key: string }) => {
 *     context.container.addInstance(SomeToken, options.key)
 *   },
 * })
 *
 * // Usage
 * app.usePlugin(defineEarlySetupPlugin({ key: 'value' }))
 * ```
 */
export const definePreModulesTraversePlugin = createPluginFactory<
  'pre:modules-traverse',
  ContainerOnlyContext
>(PluginStages.PRE_MODULES_TRAVERSE)

/**
 * Define a plugin that runs after modules are traversed.
 *
 * Context: container + modules + moduleLoader
 *
 * Use this stage to inspect loaded modules or extend the module tree.
 *
 * @example
 * ```typescript
 * export const defineModuleInspectorPlugin = definePostModulesTraversePlugin({
 *   name: 'module-inspector',
 *   register: (context, options) => {
 *     console.log('Loaded modules:', context.modules.size)
 *   },
 * })
 * ```
 */
export const definePostModulesTraversePlugin = createPluginFactory<
  'post:modules-traverse',
  ModulesLoadedContext
>(PluginStages.POST_MODULES_TRAVERSE)

/**
 * Define a plugin that runs before adapter is resolved from container.
 *
 * Context: container + modules + moduleLoader (NO adapter yet!)
 *
 * Use this stage to modify registry/bindings before adapter instantiation.
 * This is ideal for instrumentation, service wrapping, or changing DI bindings.
 *
 * @example
 * ```typescript
 * export const defineOtelPlugin = definePreAdapterResolvePlugin({
 *   name: 'otel',
 *   register: (context, options: OtelOptions) => {
 *     const registry = context.container.getRegistry()
 *     // Modify registry before adapter is created
 *   },
 * })
 *
 * // Usage
 * app.usePlugin(defineOtelPlugin({ serviceName: 'my-app' }))
 * ```
 */
export const definePreAdapterResolvePlugin = createPluginFactory<
  'pre:adapter-resolve',
  ModulesLoadedContext
>(PluginStages.PRE_ADAPTER_RESOLVE)

// ============ Post-Adapter Stages (Adapter available) ============

/**
 * Define a plugin that runs after adapter is resolved.
 *
 * Context: full (container + modules + moduleLoader + adapter)
 *
 * @example
 * ```typescript
 * export const defineAdapterConfigPlugin = definePostAdapterResolvePlugin<
 *   { prefix: string },
 *   BunApplicationServiceInterface
 * >()({
 *   name: 'adapter-config',
 *   register: (context, options) => {
 *     context.adapter.setGlobalPrefix(options.prefix)
 *   },
 * })
 * ```
 */
export function definePostAdapterResolvePlugin<
  TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface,
>() {
  return createPluginFactory<'post:adapter-resolve', FullPluginContext<TAdapter>>(
    PluginStages.POST_ADAPTER_RESOLVE,
  )
}

/**
 * Define a plugin that runs before adapter setup.
 *
 * Context: full
 */
export function definePreAdapterSetupPlugin<
  TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface,
>() {
  return createPluginFactory<'pre:adapter-setup', FullPluginContext<TAdapter>>(
    PluginStages.PRE_ADAPTER_SETUP,
  )
}

/**
 * Define a plugin that runs after adapter setup.
 *
 * Context: full
 */
export function definePostAdapterSetupPlugin<
  TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface,
>() {
  return createPluginFactory<'post:adapter-setup', FullPluginContext<TAdapter>>(
    PluginStages.POST_ADAPTER_SETUP,
  )
}

/**
 * Define a plugin that runs before modules init (route registration).
 *
 * Context: full
 */
export function definePreModulesInitPlugin<
  TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface,
>() {
  return createPluginFactory<'pre:modules-init', FullPluginContext<TAdapter>>(
    PluginStages.PRE_MODULES_INIT,
  )
}

/**
 * Define a plugin that runs after modules init (route registration).
 *
 * Context: full
 *
 * This is the default stage for legacy NaviosPlugin implementations.
 *
 * @example
 * ```typescript
 * export const defineOpenApiPlugin = definePostModulesInitPlugin<
 *   BunApplicationServiceInterface
 * >()({
 *   name: 'openapi',
 *   register: async (context, options: OpenApiOptions) => {
 *     // Routes are registered, can generate OpenAPI docs
 *   },
 * })
 * ```
 */
export function definePostModulesInitPlugin<
  TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface,
>() {
  return createPluginFactory<'post:modules-init', FullPluginContext<TAdapter>>(
    PluginStages.POST_MODULES_INIT,
  )
}

/**
 * Define a plugin that runs before adapter signals ready.
 *
 * Context: full
 */
export function definePreReadyPlugin<
  TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface,
>() {
  return createPluginFactory<'pre:ready', FullPluginContext<TAdapter>>(PluginStages.PRE_READY)
}

/**
 * Define a plugin that runs after adapter signals ready.
 *
 * Context: full - this is the final stage, app is fully initialized
 *
 * @example
 * ```typescript
 * export const defineStartupLogPlugin = definePostReadyPlugin()({
 *   name: 'startup-log',
 *   register: (context) => {
 *     console.log('Application fully initialized!')
 *   },
 * })
 * ```
 */
export function definePostReadyPlugin<
  TAdapter extends AbstractAdapterInterface = AbstractAdapterInterface,
>() {
  return createPluginFactory<'post:ready', FullPluginContext<TAdapter>>(PluginStages.POST_READY)
}
