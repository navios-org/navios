import type { SchemaLike } from '../routing/endpoint-config.mjs'

import { fieldDecoder } from './field-decoder.mjs'
import { parseJson } from './parse-json.mjs'

export interface MultipartCollector {
  /** Adds one part: the text of a field, or a file. */
  add(field: string, value: unknown): void
  /** The object to validate against the endpoint's `requestSchema`. */
  result(): Record<string, unknown>
}

function parseJsonLike(value: unknown): unknown {
  if (typeof value !== 'string' || !/^\s*[[{]/.test(value)) {
    return value
  }
  try {
    return parseJson(value)
  } catch {
    return value
  }
}

/**
 * A file under the last part of its name. The name comes from the client, and
 * one that is a path, or a step up, must not become part of one.
 */
function named(file: File): File {
  // A runtime may give a part without a file name no name at all.
  const sent = file.name as string | undefined
  let name = sent ?? ''
  name = name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1)
  if (name === '.' || name === '..') {
    name = ''
  }
  return name === sent
    ? file
    : new File([file], name, { type: file.type, lastModified: file.lastModified })
}

/**
 * Builds the body object of a multipart request, part by part. Several parts
 * with one name become a list.
 *
 * A schema that describes its fields gives each the form it declares (see
 * `fieldDecoder`). For one that does not, a part that looks like the JSON of
 * an object or of an array is parsed.
 *
 * The result has no prototype: field names come from the client, and a part
 * named `toString`, `constructor` or `__proto__` is a field like any other.
 */
export function createMultipartCollector(schema: SchemaLike | undefined): MultipartCollector {
  const { known, decode } = fieldDecoder(schema, 'multipart')
  const parts = new Map<string, unknown[]>()
  return {
    add(field, part) {
      const content = part instanceof File ? named(part) : part
      const value = known ? content : parseJsonLike(content)
      const values = parts.get(field)
      if (values === undefined) {
        parts.set(field, [value])
      } else {
        values.push(value)
      }
    },
    result() {
      const fields: Record<string, unknown> = Object.create(null)
      for (const [field, values] of parts) {
        fields[field] = values.length === 1 ? values[0] : values
      }
      return decode === undefined ? fields : decode(fields)
    },
  }
}
