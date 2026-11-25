import { isObject } from '../internal/is-object.mjs'

import type { JsonSchema } from './json-schema.mjs'

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
