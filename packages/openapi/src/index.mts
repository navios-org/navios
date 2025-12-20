// Decorators and their types
export {
  ApiTag,
  ApiOperation,
  ApiSummary,
  ApiDeprecated,
  ApiSecurity,
  ApiExclude,
  ApiStream,
  type ApiOperationOptions,
  type ApiTagOptions,
  type ApiStreamOptions,
  type ApiDeprecatedOptions,
  type ApiSecurityRequirement,
} from './decorators/index.mjs'

// Metadata types
export type { OpenApiEndpointMetadata } from './metadata/index.mjs'

// Services (Injectable classes - recommended for DI integration)
export {
  OpenApiGeneratorService,
  type OpenApiGeneratorOptions,
  EndpointScannerService,
  type DiscoveredEndpoint,
  MetadataExtractorService,
  SchemaConverterService,
  type SchemaConversionResult,
  PathBuilderService,
  type PathItemResult,
} from './services/index.mjs'

// Tokens (for advanced usage)
export {
  ApiTagToken,
  ApiOperationToken,
  ApiSummaryToken,
  ApiDeprecatedToken,
  ApiSecurityToken,
  ApiExcludeToken,
  ApiStreamToken,
} from './tokens/index.mjs'
