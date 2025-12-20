// Plugin
export {
  OpenApiBunPlugin,
  defineOpenApiPlugin,
  type BunOpenApiPluginOptions,
  type ScalarOptions,
  type ScalarTheme,
} from './openapi-bun.plugin.mjs'

// Schemas (for advanced use cases)
export {
  bunOpenApiPluginOptionsSchema,
  scalarOptionsSchema,
  scalarThemeSchema,
  type BunOpenApiPluginOptionsBase,
} from './schemas/index.mjs'

// Tokens (for advanced use cases)
export { OpenApiOptionsToken } from './tokens/index.mjs'

// Services (for advanced use cases)
export {
  OpenApiDocumentService,
  OpenApiDocumentServiceToken,
} from './services/index.mjs'

// Controller factories (for custom setups)
export { createOpenApiJsonController } from './controllers/openapi-json.controller.mjs'
export { createOpenApiYamlController } from './controllers/openapi-yaml.controller.mjs'
export { createOpenApiUiController } from './controllers/openapi-ui.controller.mjs'
