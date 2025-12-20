import type { OpenApiGeneratorOptions } from '@navios/openapi'

/**
 * OpenAPI document shape (minimal interface for typing)
 */
export interface OpenAPIDocument {
  openapi: string
  info: {
    title: string
    version: string
  }
  paths?: Record<string, unknown>
  servers?: Array<{
    url: string
    description?: string
  }>
}

/**
 * Applies global prefix to OpenAPI servers if needed.
 *
 * @param document - The OpenAPI document to modify
 * @param globalPrefix - The global route prefix (e.g., '/api/v1')
 * @param options - Plugin options that may contain server configuration
 * @returns The document with servers array updated if applicable
 */
export function applyGlobalPrefix<T extends OpenAPIDocument>(
  document: T,
  globalPrefix: string,
  options: OpenApiGeneratorOptions,
): T {
  // If servers are already defined, don't modify
  if (options.servers && options.servers.length > 0) {
    return document
  }

  // If no global prefix, return as-is
  if (!globalPrefix) {
    return document
  }

  // Add a default server with the global prefix
  return {
    ...document,
    servers: [
      {
        url: globalPrefix,
        description: 'API with global prefix',
      },
    ],
  }
}
