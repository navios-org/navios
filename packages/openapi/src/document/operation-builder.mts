import type { RouteInfo, StandardSchemaV1 } from '@navios/server'

import { describeMultipartFields } from '../json-schema/index.mjs'

import type { OpenApiEndpointMetadata } from '../annotations/index.mjs'
import type { JsonSchema, SchemaConverter } from '../json-schema/index.mjs'

import type {
  OpenApiMediaType,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiRequestBody,
  OpenApiResponse,
} from './openapi-document.mjs'

interface ObjectShape {
  properties: Record<string, JsonSchema>
  required: string[]
}

function isSchema(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sameSchema(a: JsonSchema, b: JsonSchema): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function ownShape(schema: JsonSchema): ObjectShape {
  return {
    properties: isSchema(schema.properties)
      ? (schema.properties as Record<string, JsonSchema>)
      : {},
    required: Array.isArray(schema.required) ? (schema.required as string[]) : [],
  }
}

/** One of several shapes: every property of any, required when all require it. */
function eitherShape(shapes: ObjectShape[]): ObjectShape {
  const properties: Record<string, JsonSchema> = {}
  for (const shape of shapes) {
    for (const [name, property] of Object.entries(shape.properties)) {
      const known = properties[name]
      if (known === undefined) {
        properties[name] = property
      } else if (!sameSchema(known, property)) {
        const alternatives = Array.isArray(known.anyOf) ? (known.anyOf as JsonSchema[]) : [known]
        if (!alternatives.some((alternative) => sameSchema(alternative, property))) {
          properties[name] = { anyOf: [...alternatives, property] }
        }
      }
    }
  }
  const required = Object.keys(properties).filter((name) =>
    shapes.every((shape) => shape.required.includes(name)),
  )
  return { properties, required }
}

/** All of several shapes at once: every property, required when any requires it. */
function everyShape(shapes: ObjectShape[]): ObjectShape {
  const properties: Record<string, JsonSchema> = {}
  const required = new Set<string>()
  for (const shape of shapes) {
    for (const [name, property] of Object.entries(shape.properties)) {
      const known = properties[name]
      properties[name] =
        known === undefined || sameSchema(known, property) ? property : { allOf: [known, property] }
    }
    for (const name of shape.required) {
      required.add(name)
    }
  }
  return { properties, required: Object.keys(properties).filter((name) => required.has(name)) }
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
    private readonly warn: (message: string) => void = () => {},
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

  /**
   * The properties of a schema that describes an object: one object, a
   * reference to one (a named schema), or a union or intersection of them.
   * `undefined` for anything else, which has no properties to list.
   */
  private shape(schema: JsonSchema, depth = 0): ObjectShape | undefined {
    const resolved = this.schemas.resolve(schema)
    if (depth > 8) {
      return undefined
    }
    const parts: ObjectShape[] = []
    for (const key of ['anyOf', 'oneOf'] as const) {
      const members = resolved[key]
      if (Array.isArray(members)) {
        const shapes = members.map((member) =>
          isSchema(member) ? this.shape(member, depth + 1) : undefined,
        )
        if (shapes.length === 0 || shapes.some((shape) => shape === undefined)) {
          return undefined
        }
        parts.push(eitherShape(shapes as ObjectShape[]))
      }
    }
    if (Array.isArray(resolved.allOf)) {
      for (const member of resolved.allOf) {
        const shape = isSchema(member) ? this.shape(member, depth + 1) : undefined
        if (shape === undefined) {
          return undefined
        }
        parts.push(shape)
      }
    }
    const isObjectSchema =
      resolved.type === 'object' ||
      isSchema(resolved.properties) ||
      Object.keys(resolved).length === 0
    if (parts.length === 0) {
      return isObjectSchema ? ownShape(resolved) : undefined
    }
    return everyShape([ownShape(resolved), ...parts])
  }

  /** The shape of a parameter slot; warns when the schema has none. */
  private slotShape(slot: string, schema: StandardSchemaV1): ObjectShape {
    const shape = this.shape(this.input(schema))
    if (shape === undefined) {
      this.warn(
        `[OpenAPI] ${this.label}: "${slot}" is not an object schema (nor a union or ` +
          `intersection of object schemas), so it has no properties to document as parameters.`,
      )
      return { properties: {}, required: [] }
    }
    return shape
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
    const { endpoint, params } = this.route
    const parameters: OpenApiParameter[] = []

    const urlParams = endpoint.urlParamsSchema
      ? this.slotShape('urlParamsSchema', endpoint.urlParamsSchema).properties
      : {}
    for (const name of params) {
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
      ['query', 'querySchema', endpoint.querySchema],
      ['header', 'headersSchema', endpoint.headersSchema],
      ['cookie', 'cookiesSchema', endpoint.cookiesSchema],
    ] as const
    for (const [location, option, slot] of slots) {
      if (!slot) {
        continue
      }
      const shape = this.slotShape(option, slot)
      for (const [name, property] of Object.entries(shape.properties)) {
        parameters.push({
          name,
          in: location,
          required: shape.required.includes(name),
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
      const target = this.schemas.resolve(schema)
      if (target !== schema) {
        // A named schema: the fields are described where they live, in the
        // component, and the body keeps pointing at it.
        target.type = 'object'
        target.properties = describeMultipartFields(ownShape(target).properties)
        return { required: true, content: { 'multipart/form-data': { schema } } }
      }
      return {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              ...schema,
              type: 'object',
              properties: describeMultipartFields(ownShape(schema).properties),
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
