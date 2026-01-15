/**
 * Base stage names (without pre:/post: prefix)
 */
export const PluginStageBase = {
  MODULES_TRAVERSE: 'modules-traverse',
  ADAPTER_RESOLVE: 'adapter-resolve',
  ADAPTER_SETUP: 'adapter-setup',
  MODULES_INIT: 'modules-init',
  READY: 'ready',
} as const

export type PluginStageBase =
  (typeof PluginStageBase)[keyof typeof PluginStageBase]

/**
 * Full stage names with pre:/post: prefix
 */
export type PluginStage = `pre:${PluginStageBase}` | `post:${PluginStageBase}`

/**
 * Helper to create pre stage name from base
 */
export const preStage = <T extends PluginStageBase>(base: T): `pre:${T}` =>
  `pre:${base}`

/**
 * Helper to create post stage name from base
 */
export const postStage = <T extends PluginStageBase>(base: T): `post:${T}` =>
  `post:${base}`

/**
 * All stages as constants for direct access
 */
export const PluginStages = {
  PRE_MODULES_TRAVERSE: 'pre:modules-traverse',
  POST_MODULES_TRAVERSE: 'post:modules-traverse',
  PRE_ADAPTER_RESOLVE: 'pre:adapter-resolve',
  POST_ADAPTER_RESOLVE: 'post:adapter-resolve',
  PRE_ADAPTER_SETUP: 'pre:adapter-setup',
  POST_ADAPTER_SETUP: 'post:adapter-setup',
  PRE_MODULES_INIT: 'pre:modules-init',
  POST_MODULES_INIT: 'post:modules-init',
  PRE_READY: 'pre:ready',
  POST_READY: 'post:ready',
} as const satisfies Record<string, PluginStage>

/**
 * All stages in execution order
 */
export const PLUGIN_STAGES_ORDER: readonly PluginStage[] = [
  PluginStages.PRE_MODULES_TRAVERSE,
  PluginStages.POST_MODULES_TRAVERSE,
  PluginStages.PRE_ADAPTER_RESOLVE,
  PluginStages.POST_ADAPTER_RESOLVE,
  PluginStages.PRE_ADAPTER_SETUP,
  PluginStages.POST_ADAPTER_SETUP,
  PluginStages.PRE_MODULES_INIT,
  PluginStages.POST_MODULES_INIT,
  PluginStages.PRE_READY,
  PluginStages.POST_READY,
] as const
