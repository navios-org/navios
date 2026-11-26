export { openApiPlugin } from './plugin/openapi-plugin.mjs'
export type { OpenApiPluginOptions } from './plugin/openapi-plugin.mjs'
export type { ScalarMetaData, ScalarOptions, ScalarTheme } from './plugin/scalar-page.mjs'

export { generateOpenApiDocument } from './document/generate-document.mjs'
export type {
  OpenApiDocumentOptions,
  OpenApiGenerationOptions,
} from './document/generate-document.mjs'
export { extractUrlParamNames, toOpenApiPath } from './document/openapi-path.mjs'
export type {
  OpenApiDocument,
  OpenApiExternalDocs,
  OpenApiInfo,
  OpenApiMediaType,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiPathItem,
  OpenApiRequestBody,
  OpenApiResponse,
  OpenApiSecurityRequirement,
  OpenApiSecurityScheme,
  OpenApiServer,
  OpenApiTag,
} from './document/openapi-document.mjs'

export { describeMultipartFields, isBinarySchema, SchemaConverter } from './json-schema/index.mjs'
export type {
  JsonSchema,
  SchemaConverterOptions,
  SchemaIo,
  ToJsonSchema,
} from './json-schema/index.mjs'

export {
  ApiDeprecated,
  ApiDeprecatedToken,
  ApiExclude,
  ApiExcludeToken,
  ApiOperation,
  ApiOperationToken,
  ApiSecurity,
  ApiSecurityToken,
  ApiStream,
  ApiStreamToken,
  ApiSummary,
  ApiSummaryToken,
  ApiTag,
  ApiTagToken,
  extractOpenApiMetadata,
} from './annotations/index.mjs'
export type {
  ApiDeprecatedOptions,
  ApiOperationOptions,
  ApiSecurityRequirement,
  ApiStreamOptions,
  ApiTagOptions,
  OpenApiEndpointMetadata,
} from './annotations/index.mjs'
