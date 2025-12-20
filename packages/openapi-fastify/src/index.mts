// Plugin
export {
  defineOpenApiPlugin,
  OpenApiFastifyPlugin,
  type FastifyOpenApiPluginOptions,
  type ScalarOptions,
  type ScalarTheme,
} from './openapi-fastify.plugin.mjs'

// Schemas
export {
  fastifyOpenApiPluginOptionsSchema,
  scalarOptionsSchema,
  scalarThemeSchema,
  scalarMetaDataSchema,
} from './schemas/index.mjs'

// Utils
export { applyGlobalPrefix } from './utils/index.mjs'

// Re-export core OpenAPI types for convenience
export type {
  OpenApiGeneratorOptions,
  OpenApiEndpointMetadata,
  ApiOperationOptions,
  ApiTagOptions,
  ApiStreamOptions,
  ApiDeprecatedOptions,
  ApiSecurityRequirement,
} from '@navios/openapi'

// Re-export decorators for convenience
export {
  ApiTag,
  ApiOperation,
  ApiSummary,
  ApiDeprecated,
  ApiSecurity,
  ApiExclude,
  ApiStream,
} from '@navios/openapi'
