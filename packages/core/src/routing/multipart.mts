/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SchemaLike } from './types.mjs'

interface FieldShape {
  isArray: boolean
  isObject: boolean
}

/**
 * Reads, from a schema that can describe itself as JSON Schema, which
 * top-level fields are arrays and which are objects. Multipart bodies carry
 * only strings and files, so this is what tells a single-element array from
 * a scalar, and a JSON-encoded object from a string.
 *
 * Returns an empty map for schemas that do not implement the Standard JSON
 * Schema extension; the collector then falls back to what the parts look
 * like.
 */
function fieldShapes(schema: SchemaLike | undefined): Record<string, FieldShape> {
  const shapes: Record<string, FieldShape> = {}
  const converter = (schema as any)?.['~standard']?.jsonSchema?.input
  if (typeof converter !== 'function') {
    return shapes
  }
  // Files and other values without a JSON representation must not make the
  // whole conversion fail; only the field shapes are needed. Vendors take
  // that request under `libraryOptions`.
  let json: any
  try {
    json = converter({ target: 'draft-2020-12', libraryOptions: { unrepresentable: 'any' } })
  } catch {
    try {
      json = converter({ target: 'draft-2020-12' })
    } catch {
      return shapes
    }
  }
  const properties = json?.properties
  if (properties === null || typeof properties !== 'object') {
    return shapes
  }
  for (const [key, value] of Object.entries<any>(properties)) {
    const candidates = [value, ...(value?.anyOf ?? []), ...(value?.oneOf ?? [])]
    const isArray = candidates.some((entry) => entry?.type === 'array')
    const element = candidates.find((entry) => entry?.type === 'array')?.items
    const isObject = (isArray ? [element] : candidates).some(
      (entry) => entry?.type === 'object' || entry?.properties !== undefined,
    )
    shapes[key] = { isArray, isObject }
  }
  return shapes
}

function parseJsonLike(value: string): unknown {
  const first = value.trimStart()[0]
  if (first !== '{' && first !== '[') {
    return value
  }
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export interface MultipartCollector {
  /** Adds one part: a text field's string value, or a file. */
  add(field: string, value: string | File): void
  /** The object to validate against the endpoint's `requestSchema`. */
  result(): Record<string, unknown>
}

/**
 * Builds the body object of a multipart request, part by part. Adapters call
 * `add` for every part and hand `result()` to the pipeline as the body.
 *
 * - A field the schema declares as an array always becomes an array.
 * - A field the schema declares as an object (or an array of objects) is
 *   JSON-parsed.
 * - Without schema information, a repeated field becomes an array and a
 *   value that looks like a JSON object or array is parsed.
 */
export function createMultipartCollector(schema: SchemaLike | undefined): MultipartCollector {
  const shapes = fieldShapes(schema)
  const known = Object.keys(shapes).length > 0
  const target: Record<string, unknown> = {}
  return {
    add(field, raw) {
      const shape = shapes[field]
      let value: unknown = raw
      if (typeof raw === 'string') {
        if (shape?.isObject) {
          try {
            value = JSON.parse(raw)
          } catch {
            value = null
          }
        } else if (!known) {
          value = parseJsonLike(raw)
        }
      }
      if (shape?.isArray) {
        ;((target[field] ??= []) as unknown[]).push(value)
        return
      }
      if (field in target && !known) {
        const existing = target[field]
        target[field] = Array.isArray(existing) ? [...existing, value] : [existing, value]
        return
      }
      target[field] = value
    },
    result: () => target,
  }
}
