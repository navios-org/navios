import type { RouteInfo, StandardSchemaV1 } from '@navios/core'

import { describeMultipartFields, SchemaConverter } from './json-schema.mjs'
import { extractOpenApiMetadata } from './metadata.mjs'

import type { ToJsonSchema } from './json-schema.mjs'
import type { OpenApiEndpointMetadata } from './metadata.mjs'
import type {
  JsonSchema,
  OpenApiDocument,
  OpenApiExternalDocs,
  OpenApiInfo,
  OpenApiMediaType,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiRequestBody,
  OpenApiResponse,
  OpenApiSecurityRequirement,
  OpenApiSecurityScheme,
  OpenApiServer,
  OpenApiTag,
} from './types.mjs'

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

/** @deprecated Renamed to {@link OpenApiDocumentOptions}. */
export type OpenApiGeneratorOptions = OpenApiDocumentOptions

const PARAM = /\$([A-Za-z_][A-Za-z0-9_]*)/g

/** Converts a builder path (`/users/$id`) to an OpenAPI path (`/users/{id}`). */
export function toOpenApiPath(path: string): string {
  return path.replace(PARAM, '{$1}') || '/'
}

/** The names of the `$param` segments of a builder path, in order. */
export function extractUrlParamNames(path: string): string[] {
  return Array.from(path.matchAll(PARAM), (match) => match[1])
}

function properties(schema: JsonSchema): Record<string, JsonSchema> {
  const value = schema.properties
  return typeof value === 'object' && value !== null ? (value as Record<string, JsonSchema>) : {}
}

function required(schema: JsonSchema): string[] {
  return Array.isArray(schema.required) ? (schema.required as string[]) : []
}

function json(schema: JsonSchema): Record<string, OpenApiMediaType> {
  return { 'application/json': { schema } }
}

const DEFAULT_CONTENT_TYPE = {
  stream: 'application/octet-stream',
  blob: 'application/octet-stream',
  text: 'text/plain',
} as const

function rawContent(contentType: string): Record<string, OpenApiMediaType> {
  if (contentType === 'text/event-stream') {
    return {
      [contentType]: { schema: { type: 'string', description: 'Server-Sent Events stream' } },
    }
  }
  if (contentType === 'application/json') {
    return {
      [contentType]: { schema: { type: 'string', description: 'Newline-delimited JSON stream' } },
    }
  }
  if (contentType.startsWith('text/')) {
    return { [contentType]: { schema: { type: 'string' } } }
  }
  return { [contentType]: { schema: { type: 'string', format: 'binary' } } }
}

class OperationBuilder {
  constructor(
    private readonly route: RouteInfo,
    private readonly metadata: OpenApiEndpointMetadata,
    private readonly schemas: SchemaConverter,
  ) {}

  private get label(): string {
    const { route } = this
    return `${route.method} ${route.path} (${route.controller.name}.${route.handlerName})`
  }

  private input(schema: StandardSchemaV1): JsonSchema {
    return this.schemas.convert(schema, 'input', this.label)
  }

  private output(schema: StandardSchemaV1): JsonSchema {
    return this.schemas.convert(schema, 'output', this.label)
  }

  build(): OpenApiOperation {
    const { metadata } = this
    const parameters = this.parameters()
    const operation: OpenApiOperation = {
      tags: metadata.tags.length > 0 ? metadata.tags : undefined,
      summary: metadata.summary,
      description: metadata.description,
      operationId: metadata.operationId,
      deprecated: metadata.deprecated || undefined,
      externalDocs: metadata.externalDocs,
      security: metadata.security,
      parameters: parameters.length > 0 ? parameters : undefined,
      requestBody: this.requestBody(),
      responses: this.responses(),
    }
    return Object.fromEntries(
      Object.entries(operation).filter(([, value]) => value !== undefined),
    ) as unknown as OpenApiOperation
  }

  private parameters(): OpenApiParameter[] {
    const { endpoint, path } = this.route
    const parameters: OpenApiParameter[] = []

    const urlParams = endpoint.urlParamsSchema
      ? properties(this.input(endpoint.urlParamsSchema))
      : {}
    for (const name of extractUrlParamNames(path)) {
      const schema = urlParams[name] ?? { type: 'string' }
      parameters.push({
        name,
        in: 'path',
        required: true,
        schema,
        description: schema.description as string | undefined,
      })
    }

    const slots = [
      ['query', endpoint.querySchema],
      ['header', endpoint.headersSchema],
      ['cookie', endpoint.cookiesSchema],
    ] as const
    for (const [location, slot] of slots) {
      if (!slot) {
        continue
      }
      const schema = this.input(slot)
      const mandatory = required(schema)
      for (const [name, property] of Object.entries(properties(schema))) {
        parameters.push({
          name,
          in: location,
          required: mandatory.includes(name),
          schema: property,
          description: property.description as string | undefined,
        })
      }
    }

    return parameters.map(
      (parameter) =>
        Object.fromEntries(
          Object.entries(parameter).filter(([, value]) => value !== undefined),
        ) as unknown as OpenApiParameter,
    )
  }

  private requestBody(): OpenApiRequestBody | undefined {
    const { endpoint } = this.route
    if (endpoint.body === 'multipart') {
      if (!endpoint.requestSchema) {
        return {
          required: true,
          content: { 'multipart/form-data': { schema: { type: 'object' } } },
        }
      }
      const schema = this.input(endpoint.requestSchema)
      return {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              ...schema,
              type: 'object',
              properties: describeMultipartFields(properties(schema)),
            },
          },
        },
      }
    }
    if (!endpoint.requestSchema) {
      return undefined
    }
    return { required: true, content: json(this.input(endpoint.requestSchema)) }
  }

  /**
   * Mirrors how core answers: a per-status `responses` map wins; else
   * `response: 'void'` is 204, a stream, text or blob is 200 with its
   * content type, and anything else is 200 JSON.
   */
  private responses(): Record<string, OpenApiResponse> {
    const { endpoint } = this.route
    const kind = endpoint.response ?? 'json'
    const responses: Record<string, OpenApiResponse> = {}

    if (endpoint.responses && kind !== 'void') {
      for (const [status, schema] of Object.entries(endpoint.responses)) {
        responses[status] =
          schema === null
            ? { description: 'No content' }
            : { description: 'Successful response', content: json(this.output(schema)) }
      }
    } else if (kind === 'void') {
      responses['204'] = { description: 'No content' }
    } else if (kind !== 'json') {
      const stream = this.metadata.stream
      const fallback = kind === 'stream' ? 'Stream response' : 'Successful response'
      responses['200'] = {
        description: stream?.description ?? fallback,
        content: rawContent(stream?.contentType ?? DEFAULT_CONTENT_TYPE[kind]),
      }
    } else if (endpoint.responseSchema) {
      responses['200'] = {
        description: 'Successful response',
        content: json(this.output(endpoint.responseSchema)),
      }
    } else {
      responses['200'] = { description: 'Successful response' }
    }

    for (const [status, schema] of Object.entries(endpoint.errorSchema ?? {})) {
      responses[status] = {
        description: `Error response (${status})`,
        content: json(this.output(schema)),
      }
    }
    return responses
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
