import type { ApiSecurityRequirement, ApiStreamOptions } from '../decorators/index.mjs'

/**
 * Extracted OpenAPI metadata for an endpoint
 */
export interface OpenApiEndpointMetadata {
  /** Tags for grouping endpoints */
  tags: string[]
  /** Short summary */
  summary?: string
  /** Detailed description */
  description?: string
  /** Unique operation identifier */
  operationId?: string
  /** Whether the endpoint is deprecated */
  deprecated: boolean
  /** Deprecation message */
  deprecationMessage?: string
  /** Security requirements */
  security?: ApiSecurityRequirement[]
  /** External documentation link */
  externalDocs?: {
    url: string
    description?: string
  }
  /** Stream content type (for stream endpoints) */
  stream?: ApiStreamOptions
  /** Whether to exclude from documentation */
  excluded: boolean
}
