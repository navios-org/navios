import type { StandardSchemaV1 } from '@navios/core'

import type { JsonSchema } from './types.mjs'

/**
 * Which side of a schema is described: `input` is what a client sends
 * (request slots), `output` is what it receives (responses).
 */
export type SchemaIo = 'input' | 'output'

/**
 * Converts a schema to JSON Schema, for schema libraries that do not
 * implement the Standard JSON Schema extension (`~standard.jsonSchema`).
 * Return `undefined` for a schema the converter does not know.
 */
export type ToJsonSchema = (schema: StandardSchemaV1, io: SchemaIo) => JsonSchema | undefined

export interface SchemaConverterOptions {
  toJsonSchema?: ToJsonSchema
  /**
   * Called when a schema has neither `~standard.jsonSchema` nor a result
   * from `toJsonSchema`, with the endpoint it belongs to.
   */
  onUnconvertible?: (endpoint: string) => void
}

interface StandardJsonSchemaConverter {
  input(options: unknown): Record<string, unknown>
  output(options: unknown): Record<string, unknown>
}

const JSON_SCHEMA_OPTIONS = {
  target: 'draft-2020-12',
  // Understood by zod: types without a JSON form (Date, File, custom
  // checks) become an unconstrained schema instead of an error.
  libraryOptions: { unrepresentable: 'any' },
}

const SCHEMA_KEYS = [
  'items',
  'additionalProperties',
  'unevaluatedProperties',
  'unevaluatedItems',
  'propertyNames',
  'contains',
  'not',
  'if',
  'then',
  'else',
  'contentSchema',
]
const SCHEMA_ARRAY_KEYS = ['allOf', 'anyOf', 'oneOf', 'prefixItems']
const SCHEMA_MAP_KEYS = ['properties', 'patternProperties', 'dependentSchemas']
const DEFINITION_KEYS = ['$defs', 'definitions']

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Turns Standard Schemas into JSON Schemas ready to be placed in an OpenAPI
 * document, and collects the named definitions they share.
 *
 * 1. `schema['~standard'].jsonSchema.input()` / `.output()` when the schema
 *    library implements the Standard JSON Schema extension;
 * 2. else the `toJsonSchema` option;
 * 3. else an unconstrained schema (`{}`), reported through `onUnconvertible`.
 */
export class SchemaConverter {
  /** Named schemas (`$defs` of the converted schemas), for `components.schemas`. */
  readonly components: Record<string, JsonSchema> = {}
  private readonly sources = new Map<string, string>()
  private anonymous = 0

  constructor(private readonly options: SchemaConverterOptions = {}) {}

  convert(schema: StandardSchemaV1, io: SchemaIo, endpoint = 'unknown endpoint'): JsonSchema {
    const raw = this.toJsonSchema(schema, io)
    if (raw === undefined) {
      this.options.onUnconvertible?.(endpoint)
      return {}
    }
    return this.normalise(raw, io)
  }

  private toJsonSchema(schema: StandardSchemaV1, io: SchemaIo): JsonSchema | undefined {
    const standard = (schema as { '~standard'?: { jsonSchema?: StandardJsonSchemaConverter } })[
      '~standard'
    ]
    const converter = standard?.jsonSchema
    if (converter && typeof converter[io] === 'function') {
      try {
        const result = converter[io](JSON_SCHEMA_OPTIONS)
        if (isObject(result)) {
          return result
        }
      } catch {
        // The library cannot express this schema; try the user's converter.
      }
    }
    const custom = this.options.toJsonSchema?.(schema, io)
    return isObject(custom) ? custom : undefined
  }

  /**
   * Makes a JSON Schema document embeddable: drops `$schema`, moves `$defs`
   * to the shared components and points `$ref`s at them.
   */
  private normalise(raw: JsonSchema, io: SchemaIo): JsonSchema {
    const root = structuredCloneJson(raw)
    delete root.$schema

    const definitions: Record<string, JsonSchema> = {}
    for (const key of DEFINITION_KEYS) {
      if (isObject(root[key])) {
        for (const [name, definition] of Object.entries(root[key])) {
          if (isObject(definition)) {
            definitions[`#/${key}/${name}`] = definition
          }
        }
      }
      delete root[key]
    }

    // Decide the component name of every definition before rewriting, so
    // that definitions referring to each other resolve.
    const refs = new Map<string, string>()
    const added: Array<[name: string, definition: JsonSchema]> = []
    for (const [pointer, definition] of Object.entries(definitions)) {
      const name = this.reserve(pointer.slice(pointer.lastIndexOf('/') + 1), definition, io)
      refs.set(pointer, `#/components/schemas/${name.name}`)
      if (name.isNew) {
        added.push([name.name, definition])
      }
    }

    let selfReferenced = false
    const visit = (node: unknown): void => {
      if (!isObject(node)) {
        return
      }
      // zod-openapi convention: `.meta({ openapi: { ... } })`.
      if (isObject(node.openapi)) {
        const { openapi } = node
        delete node.openapi
        Object.assign(node, openapi)
      }
      if (typeof node.$ref === 'string') {
        if (node.$ref === '#') {
          selfReferenced = true
        } else {
          node.$ref = refs.get(node.$ref) ?? node.$ref
        }
      }
      for (const key of SCHEMA_KEYS) {
        visit(node[key])
      }
      for (const key of SCHEMA_ARRAY_KEYS) {
        if (Array.isArray(node[key])) {
          node[key].forEach(visit)
        }
      }
      for (const key of SCHEMA_MAP_KEYS) {
        if (isObject(node[key])) {
          Object.values(node[key]).forEach(visit)
        }
      }
    }

    visit(root)
    for (const [name, definition] of added) {
      visit(definition)
      this.components[name] = definition
    }

    if (selfReferenced) {
      // A recursive schema refers to its own root, which has no address
      // inside an OpenAPI document until it is a component.
      const title = typeof root.title === 'string' ? root.title : `Schema${++this.anonymous}`
      const { name } = this.reserve(title, root, io)
      const ref = `#/components/schemas/${name}`
      const point = (node: unknown): void => {
        if (Array.isArray(node)) {
          node.forEach(point)
        } else if (isObject(node)) {
          if (node.$ref === '#') {
            node.$ref = ref
          }
          Object.values(node).forEach(point)
        }
      }
      point(root)
      for (const [, definition] of added) {
        point(definition)
      }
      this.components[name] = root
      return { $ref: ref }
    }
    return root
  }

  /**
   * Picks the component name for a definition. The same definition met again
   * keeps its name; a different one under a taken name gets a suffix.
   */
  private reserve(
    wanted: string,
    definition: JsonSchema,
    io: SchemaIo,
  ): { name: string; isNew: boolean } {
    const source = JSON.stringify(definition)
    const candidates = [wanted, `${wanted}${io === 'input' ? 'Input' : 'Output'}`]
    for (let index = 0; ; index++) {
      const name = candidates[index] ?? `${wanted}${index}`
      const existing = this.sources.get(name)
      if (existing === undefined) {
        this.sources.set(name, source)
        return { name, isNew: true }
      }
      if (existing === source) {
        return { name, isNew: false }
      }
    }
  }
}

function structuredCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Whether a JSON Schema describes a binary string (a file). */
export function isBinarySchema(schema: unknown): boolean {
  return isObject(schema) && schema.type === 'string' && schema.format === 'binary'
}

function isUnconstrained(schema: unknown): boolean {
  if (!isObject(schema)) {
    return false
  }
  return Object.keys(schema).every((key) => key === 'description' || key === 'title')
}

/**
 * Describes the fields of a multipart body. A multipart field is a string or
 * a file, so a field whose schema says nothing about its type (what
 * `z.instanceof(File)` converts to) is documented as a binary string, and an
 * array of such fields as an array of binary strings.
 */
export function describeMultipartFields(
  properties: Record<string, JsonSchema>,
): Record<string, JsonSchema> {
  const result: Record<string, JsonSchema> = {}
  for (const [name, property] of Object.entries(properties)) {
    if (isBinarySchema(property) || isUnconstrained(property)) {
      result[name] = { ...property, type: 'string', format: 'binary' }
    } else if (
      property.type === 'array' &&
      (isBinarySchema(property.items) || isUnconstrained(property.items))
    ) {
      result[name] = {
        ...property,
        items: { ...(property.items as JsonSchema), type: 'string', format: 'binary' },
      }
    } else {
      result[name] = property
    }
  }
  return result
}
