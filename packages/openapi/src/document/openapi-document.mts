import type { JsonSchema } from '../json-schema/index.mjs'

/**
 * The parts of an OpenAPI 3.1 document this package writes. Objects are open
 * (`[key: string]: unknown`) where the specification allows extensions.
 */

export interface OpenApiInfo {
  title: string
  version: string
  summary?: string
  description?: string
  termsOfService?: string
  contact?: {
    name?: string
    url?: string
    email?: string
  }
  license?: {
    name: string
    identifier?: string
    url?: string
  }
}

export interface OpenApiExternalDocs {
  url: string
  description?: string
}

export interface OpenApiServer {
  url: string
  description?: string
  variables?: Record<
    string,
    {
      default: string
      enum?: string[]
      description?: string
    }
  >
}

export interface OpenApiTag {
  name: string
  description?: string
  externalDocs?: OpenApiExternalDocs
}

export interface OpenApiSecurityScheme {
  type: 'apiKey' | 'http' | 'mutualTLS' | 'oauth2' | 'openIdConnect'
  description?: string
  name?: string
  in?: 'query' | 'header' | 'cookie'
  scheme?: string
  bearerFormat?: string
  flows?: Record<string, unknown>
  openIdConnectUrl?: string
  [extension: string]: unknown
}

export type OpenApiSecurityRequirement = Record<string, string[]>

export interface OpenApiParameter {
  name: string
  in: 'path' | 'query' | 'header' | 'cookie'
  required: boolean
  schema: JsonSchema
  description?: string
}

export interface OpenApiMediaType {
  schema?: JsonSchema
}

export interface OpenApiRequestBody {
  required: boolean
  content: Record<string, OpenApiMediaType>
}

export interface OpenApiResponse {
  description: string
  content?: Record<string, OpenApiMediaType>
}

export interface OpenApiOperation {
  tags?: string[]
  summary?: string
  description?: string
  operationId?: string
  deprecated?: boolean
  /** The message of `ApiDeprecated(message)`. A specification extension. */
  'x-deprecated-message'?: string
  externalDocs?: OpenApiExternalDocs
  security?: OpenApiSecurityRequirement[]
  parameters?: OpenApiParameter[]
  requestBody?: OpenApiRequestBody
  responses: Record<string, OpenApiResponse>
}

/** Operations of one path, by lower-case HTTP method. */
export type OpenApiPathItem = Record<string, OpenApiOperation>

export interface OpenApiDocument {
  openapi: '3.1.0'
  info: OpenApiInfo
  servers?: OpenApiServer[]
  paths: Record<string, OpenApiPathItem>
  components?: {
    schemas?: Record<string, JsonSchema>
    securitySchemes?: Record<string, OpenApiSecurityScheme>
  }
  security?: OpenApiSecurityRequirement[]
  tags?: OpenApiTag[]
  externalDocs?: OpenApiExternalDocs
}
