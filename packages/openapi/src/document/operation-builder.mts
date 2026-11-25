import type { RouteInfo, StandardSchemaV1 } from '@navios/server'

import { describeMultipartFields } from '../json-schema/index.mjs'

import type { OpenApiEndpointMetadata } from '../annotations/index.mjs'
import type { JsonSchema, SchemaConverter } from '../json-schema/index.mjs'

import { extractUrlParamNames } from './openapi-path.mjs'

import type {
  OpenApiMediaType,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiRequestBody,
  OpenApiResponse,
} from './openapi-document.mjs'

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

/** Builds the operation of one route. */
export class OperationBuilder {
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
      // OpenAPI has no field for why an operation is deprecated.
      'x-deprecated-message': metadata.deprecationMessage || undefined,
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
