import type { RouteInfo } from '@navios/server'

import { extractOpenApiMetadata } from '../annotations/index.mjs'
import { SchemaConverter } from '../json-schema/index.mjs'

import type { ToJsonSchema } from '../json-schema/index.mjs'

import { toOpenApiPath } from './openapi-path.mjs'
import { OperationBuilder } from './operation-builder.mjs'

import type {
  OpenApiDocument,
  OpenApiExternalDocs,
  OpenApiInfo,
  OpenApiSecurityRequirement,
  OpenApiSecurityScheme,
  OpenApiServer,
  OpenApiTag,
} from './openapi-document.mjs'

/**
 * What goes into the document besides the routes.
 */
export interface OpenApiDocumentOptions {
  info: OpenApiInfo
  externalDocs?: OpenApiExternalDocs
  servers?: OpenApiServer[]
  /** Security scheme definitions, placed in `components.securitySchemes`. */
  securitySchemes?: Record<string, OpenApiSecurityScheme>
  /** Security requirements of every operation that does not set its own. */
  security?: OpenApiSecurityRequirement[]
  /** Tag definitions. Tags used by routes are added to these. */
  tags?: OpenApiTag[]
}

export interface OpenApiGenerationOptions extends OpenApiDocumentOptions {
  /**
   * Converts a schema whose library does not implement the Standard JSON
   * Schema extension (`~standard.jsonSchema`). See {@link ToJsonSchema}.
   */
  toJsonSchema?: ToJsonSchema
  /** Receives warnings and debug messages. Defaults to `console`. */
  logger?: {
    warn(message: string): void
    debug?(message: string): void
  }
}

/**
 * Builds an OpenAPI 3.1 document from an application's routes.
 *
 * ```ts
 * await app.init()
 * const document = generateOpenApiDocument(app.routes(), {
 *   info: { title: 'My API', version: '1.0.0' },
 * })
 * ```
 *
 * Paths are the full route paths, with the global prefix and module prefixes
 * applied. Routes marked with `ApiExclude` are left out.
 */
export function generateOpenApiDocument(
  routes: readonly RouteInfo[],
  options: OpenApiGenerationOptions,
): OpenApiDocument {
  const logger = options.logger ?? console
  const warned = new Set<string>()
  const schemas = new SchemaConverter({
    toJsonSchema: options.toJsonSchema,
    onUnconvertible: (endpoint) => {
      if (!warned.has(endpoint)) {
        warned.add(endpoint)
        logger.warn(
          `[OpenAPI] ${endpoint} has a schema that cannot be converted to JSON Schema: its ` +
            `library does not implement the Standard JSON Schema extension and the "toJsonSchema" ` +
            `option gave no result. It is documented as an unconstrained schema.`,
        )
      }
    },
  })

  const paths: OpenApiDocument['paths'] = {}
  const tags = new Map<string, OpenApiTag>()
  for (const tag of options.tags ?? []) {
    tags.set(tag.name, tag)
  }

  let operations = 0
  for (const route of routes) {
    const metadata = extractOpenApiMetadata(route)
    if (metadata.excluded) {
      continue
    }
    for (const tag of metadata.tagDefinitions) {
      const existing = tags.get(tag.name)
      if (!existing) {
        tags.set(tag.name, { ...tag })
      } else if (existing.description === undefined && tag.description !== undefined) {
        tags.set(tag.name, { ...existing, description: tag.description })
      }
    }
    const path = toOpenApiPath(route.path)
    paths[path] = {
      ...paths[path],
      [route.method.toLowerCase()]: new OperationBuilder(route, metadata, schemas).build(),
    }
    operations++
  }

  const document: OpenApiDocument = {
    openapi: '3.1.0',
    info: options.info,
    paths,
  }
  if (options.servers && options.servers.length > 0) {
    document.servers = options.servers
  }
  if (options.externalDocs) {
    document.externalDocs = options.externalDocs
  }
  if (tags.size > 0) {
    document.tags = Array.from(tags.values())
  }
  if (options.security) {
    document.security = options.security
  }
  if (options.securitySchemes) {
    document.components = { ...document.components, securitySchemes: options.securitySchemes }
  }
  if (Object.keys(schemas.components).length > 0) {
    document.components = { ...document.components, schemas: schemas.components }
  }

  logger.debug?.(
    `[OpenAPI] Generated a document with ${operations} operation(s) on ` +
      `${Object.keys(paths).length} path(s)`,
  )
  return document
}
