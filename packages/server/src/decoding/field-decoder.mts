/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SchemaLike } from '../routing/endpoint-config.mjs'

import { parseJson } from './parse-json.mjs'

type Fields = Record<string, unknown>

/**
 * What a schema says about the fields of a query string, of url params or of
 * a multipart body. Those carry text only, so the schema is what tells a list
 * with one element from a single value, and a number from its digits.
 */
export interface FieldDecoder {
  /** Whether the schema describes its fields at all. */
  readonly known: boolean
  /**
   * Gives each field the form its schema describes. `undefined` when no field
   * needs it, so that a route without such fields does nothing for it.
   */
  readonly decode: ((fields: Fields) => Fields) | undefined
}

const UNKNOWN: FieldDecoder = { known: false, decode: undefined }

/** Where the fields come from. */
export type FieldSource = 'url' | 'multipart'

// Converting a schema to JSON Schema is far too slow to do for every request.
const decoders: Record<FieldSource, WeakMap<object, FieldDecoder>> = {
  url: new WeakMap(),
  multipart: new WeakMap(),
}

/**
 * The decoder for the fields of `schema`, worked out once per schema.
 *
 * A field is converted only when its text is exactly what a client writes for
 * a value of the declared type:
 *
 * - one value of a field declared as an array becomes a list of it, and a
 *   required array that was not sent becomes an empty one, unless its schema
 *   has a fallback for what is missing;
 * - the numeral of a JSON number becomes a number, `true` and `false` become
 *   booleans;
 * - the JSON text of an object becomes the object, and as the element of an
 *   array, that of an array becomes the array;
 * - in a multipart body, where a client cannot write `null`, empty text becomes
 *   `null`. One writes no `null` into a url at all.
 *
 * Anything else is left for the schema to judge, and so is every field that
 * may be a string, or about which the schema says nothing.
 */
export function fieldDecoder(
  schema: SchemaLike | undefined,
  source: FieldSource = 'url',
): FieldDecoder {
  if (schema === undefined || schema === null) {
    return UNKNOWN
  }
  let decoder = decoders[source].get(schema)
  if (decoder === undefined) {
    decoder = compileDecoder(toJsonSchema(schema), source === 'multipart')
    decoders[source].set(schema, decoder)
  }
  return decoder
}

/** The type of a field that holds a file, which JSON Schema has no word for. */
const FILE = 'file'

/** Whether a zod schema takes files: `z.file()` or `z.instanceof(File)`. */
function takesFiles({ def, bag }: any): boolean {
  return def.type === 'file' || (def.type === 'custom' && [File, Blob].includes(bag?.Class))
}

/** A schema that can describe itself does so through the Standard JSON Schema extension. */
function toJsonSchema(schema: SchemaLike): any {
  const convert = (schema as any)['~standard']?.jsonSchema?.input
  if (typeof convert !== 'function') {
    return undefined
  }
  // Vendors take their own options under `libraryOptions`.
  const libraryOptions = {
    // A file has no JSON representation. It must not make the conversion of
    // the other fields fail.
    unrepresentable: 'any',
    override({ zodSchema, jsonSchema }: any) {
      const { def } = zodSchema._zod
      // Zod describes `preprocess` by what comes after it. What comes in is
      // whatever its function takes.
      if (def.type === 'pipe' && def.in._zod.def.type === 'transform') {
        clear(jsonSchema)
      }
      if (takesFiles(zodSchema._zod)) {
        clear(jsonSchema)
        jsonSchema.type = FILE
      }
      if (def.type === 'catch') {
        // Also for a fallback that is worked out from what was sent.
        jsonSchema.default ??= null
      }
    },
  }
  for (const options of [{ libraryOptions }, {}]) {
    try {
      return convert({ target: 'draft-2020-12', ...options })
    } catch {
      // Not with these options, or not at all.
    }
  }
  return undefined
}

function clear(jsonSchema: any): void {
  for (const keyword of Object.keys(jsonSchema)) {
    delete jsonSchema[keyword]
  }
}

type Convert = (value: unknown) => unknown

/** The fields an object schema describes. */
interface Described {
  fields: Map<string, any>
  required: Set<string>
  /** What the fields it does not name look like. */
  rest: any
}

function compileDecoder(root: any, emptyIsNull: boolean): FieldDecoder {
  const described = describeFields(root, root, new Set())
  if (described === undefined) {
    return UNKNOWN
  }
  const converters = new Map<string, Convert>()
  const lists: string[] = []
  for (const [name, node] of described.fields) {
    const candidates = candidatesOf(node, root)
    const convert = fieldConverter(candidates, root, emptyIsNull)
    if (convert !== undefined) {
      converters.set(name, convert)
    }
    if (
      described.required.has(name) &&
      isListOnly(candidates) &&
      !hasFallback(node, root, new Set())
    ) {
      lists.push(name)
    }
  }
  const rest =
    described.rest === undefined
      ? undefined
      : fieldConverter(candidatesOf(described.rest, root), root, emptyIsNull)
  if (converters.size === 0 && rest === undefined) {
    return { known: true, decode: undefined }
  }
  return {
    known: true,
    decode(fields) {
      // Without a prototype: the names come from the client.
      const decoded: Fields = Object.assign(Object.create(null), fields)
      for (const [name, convert] of converters) {
        if (decoded[name] !== undefined) {
          decoded[name] = convert(decoded[name])
        }
      }
      for (const name of lists) {
        if (decoded[name] === undefined) {
          decoded[name] = []
        }
      }
      if (rest !== undefined) {
        for (const name in decoded) {
          if (!described.fields.has(name)) {
            decoded[name] = rest(decoded[name])
          }
        }
      }
      return decoded
    },
  }
}

function resolve(node: any, root: any): any {
  const ref = node?.$ref
  if (typeof ref !== 'string') {
    return node
  }
  // Zod writes a name as it is, also one with characters of a JSON pointer.
  const named = ref.startsWith('#/$defs/') ? root.$defs?.[ref.slice('#/$defs/'.length)] : undefined
  let target = root
  for (const part of ref.split('/').slice(1)) {
    target = target?.[part.replaceAll('~1', '/').replaceAll('~0', '~')]
  }
  return named ?? target
}

/** Whether a schema, or a part of it, says what a value that is missing is taken for. */
function hasFallback(node: any, root: any, seen: Set<unknown>): boolean {
  const schema = resolve(node, root)
  if (schema === null || typeof schema !== 'object' || seen.has(schema)) {
    return false
  }
  seen.add(schema)
  const parts = [schema.anyOf, schema.oneOf, schema.allOf].flatMap((list) => list ?? [])
  return 'default' in schema || parts.some((part) => hasFallback(part, root, seen))
}

/** The fields of an object schema, or of every alternative of a union of them. */
function describeFields(node: any, root: any, seen: Set<unknown>): Described | undefined {
  const schema = resolve(node, root)
  if (schema === null || typeof schema !== 'object' || seen.has(schema)) {
    return undefined
  }
  seen.add(schema)
  const described = describeOwnFields(schema, root, seen)
  if (described !== undefined && 'default' in schema) {
    // What stands in for a value that does not fit, not for one of its fields.
    described.required.clear()
  }
  return described
}

function describeOwnFields(schema: any, root: any, seen: Set<unknown>): Described | undefined {
  let described: Described | undefined
  if (typesOf(schema)?.includes('object')) {
    described = {
      fields: new Map(Object.entries(schema.properties ?? {})),
      required: new Set(schema.required),
      rest: schema.additionalProperties === false ? undefined : schema.additionalProperties,
    }
  }
  for (const part of schema.allOf ?? []) {
    described = merge(described, describeFields(part, root, seen), 'both')
  }
  let alternatives: Described | undefined
  for (const option of schema.anyOf ?? schema.oneOf ?? []) {
    const one = describeFields(option, root, seen)
    if (one !== undefined) {
      alternatives = merge(alternatives, one, 'either')
    } else if (candidatesOf(option, root) === undefined) {
      // One of the alternatives may be anything.
      return described
    }
  }
  return merge(described, alternatives, 'both')
}

function merge(
  a: Described | undefined,
  b: Described | undefined,
  mode: 'both' | 'either',
): Described | undefined {
  if (a === undefined || b === undefined) {
    return a ?? b
  }
  const fields = new Map(a.fields)
  for (const [name, node] of b.fields) {
    const existing = fields.get(name)
    const keyword = mode === 'both' ? 'allOf' : 'anyOf'
    fields.set(name, existing === undefined ? node : { [keyword]: [existing, node] })
  }
  const required =
    mode === 'both'
      ? [...a.required, ...b.required]
      : [...a.required].filter((name) => b.required.has(name))
  return { fields, required: new Set(required), rest: a.rest ?? b.rest }
}

/** The types a value may have, and the schemas of the elements when it is an array. */
interface Candidates {
  types: Set<string>
  elements: any[]
}

/** `undefined` for a schema that does not say, or that leaves a type open. */
function candidatesOf(
  node: any,
  root: any,
  seen: Set<unknown> = new Set(),
): Candidates | undefined {
  const schema = resolve(node, root)
  if (schema === null || typeof schema !== 'object') {
    return undefined
  }
  if (seen.has(schema)) {
    // Met on the way already: it adds nothing.
    return { types: new Set(), elements: [] }
  }
  seen.add(schema)
  const types = typesOf(schema)
  if (types !== undefined) {
    const elements = [...(schema.prefixItems ?? []), ...[schema.items ?? []].flat()].filter(
      (element) => element !== false,
    )
    return { types: new Set(types), elements: types.includes('array') ? elements : [] }
  }
  const options = schema.anyOf ?? schema.oneOf
  if (Array.isArray(options)) {
    const union: Candidates = { types: new Set(), elements: [] }
    for (const option of options) {
      const one = candidatesOf(option, root, seen)
      if (one === undefined) {
        return undefined
      }
      one.types.forEach((type) => union.types.add(type))
      union.elements.push(...one.elements)
    }
    return union
  }
  // Every part holds, so the first that says something is enough.
  for (const part of schema.allOf ?? []) {
    const one = candidatesOf(part, root, seen)
    if (one !== undefined) {
      return one
    }
  }
  return undefined
}

function typesOf(schema: any): string[] | undefined {
  if (schema.type !== undefined) {
    return [schema.type].flat()
  }
  if ('const' in schema) {
    return [typeName(schema.const)]
  }
  if (Array.isArray(schema.enum)) {
    return schema.enum.map(typeName)
  }
  return schema.properties !== undefined ? ['object'] : undefined
}

function typeName(value: unknown): string {
  return value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
}

function isListOnly(candidates: Candidates | undefined): boolean {
  return (
    candidates !== undefined &&
    candidates.types.has('array') &&
    [...candidates.types].every((type) => type === 'array' || type === 'null')
  )
}

function fieldConverter(
  candidates: Candidates | undefined,
  root: any,
  emptyIsNull: boolean,
): Convert | undefined {
  if (candidates === undefined || candidates.types.has('string')) {
    return undefined
  }
  const convertOne = textConverter(candidates.types, false, emptyIsNull)
  if (!candidates.types.has('array')) {
    return convertOne
  }
  const convertElement = elementConverter(candidates.elements, root, emptyIsNull)
  return (value) => {
    if (Array.isArray(value)) {
      return convertElement === undefined ? value : value.map(convertElement)
    }
    const single = convertOne?.(value)
    if (single !== undefined && single !== value) {
      return single
    }
    return [convertElement === undefined ? value : convertElement(value)]
  }
}

function elementConverter(elements: any[], root: any, emptyIsNull: boolean): Convert | undefined {
  const union = candidatesOf({ anyOf: elements }, root)
  if (elements.length === 0 || union === undefined || union.types.has('string')) {
    return undefined
  }
  return textConverter(union.types, union.types.has('array'), emptyIsNull)
}

/** A numeral as JSON has it, so not `1.`, `+1`, `0x1`, ` 1` or `007`. */
const NUMERAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/

function textConverter(
  types: Set<string>,
  allowArray: boolean,
  emptyIsNull: boolean,
): Convert | undefined {
  const isNumber = types.has('number') || types.has('integer')
  const isBoolean = types.has('boolean')
  const isObject = types.has('object')
  const isNull = emptyIsNull && types.has('null')
  if (!isNumber && !isBoolean && !isObject && !allowArray && !isNull) {
    return undefined
  }
  return (value) => {
    if (typeof value !== 'string') {
      return value
    }
    if (isNull && value === '') {
      return null
    }
    if (isNumber && NUMERAL.test(value)) {
      return toNumber(value)
    }
    if (isBoolean && (value === 'true' || value === 'false')) {
      return value === 'true'
    }
    const start = value.trimStart()[0]
    if ((isObject && start === '{') || (allowArray && start === '[')) {
      try {
        return parseJson(value)
      } catch {
        return value
      }
    }
    return value
  }
}

/** The number, unless another whole number would be meant by it. */
function toNumber(text: string): number | string {
  const value = Number(text)
  return Number.isFinite(value) && (Number.isSafeInteger(value) || !/^-?\d+$/.test(text))
    ? value
    : text
}
