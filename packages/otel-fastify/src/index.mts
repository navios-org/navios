// Plugin
export { defineOtelPlugin, OtelFastifyPlugin } from './plugin/index.mjs'

// Interfaces
export type { FastifyOtelPluginOptions } from './interfaces/index.mjs'

// Hooks (for advanced usage)
export {
  createOnErrorHook,
  createOnRequestHook,
  createOnResponseHook,
} from './hooks/index.mjs'
