import type { StandardSchemaIssue, StandardSchemaV1 } from '@navios/core'

export interface ZodPayload {
  value: unknown
  issues: unknown[]
}

/** What a zod 4 schema (classic or mini) offers besides Standard Schema. */
export interface ZodSchema extends StandardSchemaV1 {
  _zod: {
    def: ZodDefinition
    run(payload: ZodPayload, ctx: { async: boolean }): ZodPayload | Promise<ZodPayload>
  }
  safeParseAsync(
    value: unknown,
  ): Promise<
    | { success: true; data: unknown }
    | { success: false; error: { issues: ReadonlyArray<StandardSchemaIssue> } }
  >
}

/** The parts of a schema's or a check's definition that the walk reads. */
interface ZodDefinition {
  type?: string
  check?: string
  checks?: ReadonlyArray<{ _zod?: { def?: ZodDefinition } }>
  [member: string]: unknown
}

function isZod(schema: StandardSchemaV1): schema is ZodSchema {
  const { _zod, safeParseAsync } = schema as Partial<ZodSchema>
  return (
    schema['~standard'].vendor === 'zod' &&
    typeof _zod?.run === 'function' &&
    typeof safeParseAsync === 'function'
  )
}

/** Types that validate by themselves, with nothing inside. */
const LEAVES = new Set([
  'any',
  'bigint',
  'boolean',
  'date',
  'enum',
  'file',
  'literal',
  'nan',
  'never',
  'null',
  'number',
  'string',
  'symbol',
  'template_literal',
  'undefined',
  'unknown',
  'void',
])

/** Types made of other schemas, and where in their definition those are. */
const PARTS: Record<string, readonly string[]> = {
  array: ['element'],
  catch: ['innerType'],
  default: ['innerType'],
  intersection: ['left', 'right'],
  map: ['keyType', 'valueType'],
  nonoptional: ['innerType'],
  nullable: ['innerType'],
  object: ['shape', 'catchall'],
  optional: ['innerType'],
  prefault: ['innerType'],
  readonly: ['innerType'],
  record: ['keyType', 'valueType'],
  set: ['valueType'],
  success: ['innerType'],
  tuple: ['items', 'rest'],
  union: ['options'],
}

/** Checks that compare a value with something, and those that replace it. */
const CHECKS = new Set([
  'bigint_format',
  'greater_than',
  'length_equals',
  'less_than',
  'max_length',
  'max_size',
  'mime_type',
  'min_length',
  'min_size',
  'multiple_of',
  'number_format',
  'overwrite',
  'size_equals',
  'string_format',
])

/**
 * Whether validating with `schema` may meet a promise for some value: whether
 * it holds a function of the application (a refinement, a transform, a codec)
 * or anything this does not know.
 */
export function mayBeAsync(schema: StandardSchemaV1): boolean {
  if (!isZod(schema)) {
    return false
  }
  try {
    return walk(schema, new Set())
  } catch {
    // A getter of a lazy or recursive schema threw. Validating reports it.
    return true
  }
}

function walk(node: unknown, seen: Set<unknown>): boolean {
  if (node === undefined || node === null || seen.has(node)) {
    // A schema that contains itself is as asynchronous as its other parts.
    return false
  }
  seen.add(node)
  const { def, innerType, bag } = (
    node as {
      _zod: { def: ZodDefinition; innerType?: unknown; bag?: { Class?: unknown } }
    }
  )._zod
  const type = def.type as string
  for (const check of def.checks ?? []) {
    if (checkMayBeAsync(check._zod?.def, seen)) {
      return true
    }
  }
  if (LEAVES.has(type)) {
    return false
  }
  if (type === 'custom') {
    // The function of `z.instanceof()` is zod's.
    return bag?.Class === undefined
  }
  if (type === 'lazy') {
    return walk(innerType, seen)
  }
  if (type === 'pipe') {
    // A codec is a pipe with functions of its own.
    return def.transform !== undefined || walk(def.in, seen) || walk(def.out, seen)
  }
  const parts = Object.hasOwn(PARTS, type) ? PARTS[type] : undefined
  if (parts === undefined) {
    return true
  }
  for (const name of parts) {
    const part = def[name]
    // One schema, a list of them, or the fields of an object.
    const schemas = isSchema(part) ? [part] : Object.values(part ?? {})
    for (const inner of schemas) {
      if (walk(inner, seen)) {
        return true
      }
    }
  }
  return false
}

function checkMayBeAsync(def: ZodDefinition | undefined, seen: Set<unknown>): boolean {
  if (def === undefined) {
    return true
  }
  if (def.check === 'property') {
    return walk(def.schema, seen)
  }
  return !CHECKS.has(def.check as string)
}

function isSchema(value: unknown): boolean {
  return typeof value === 'object' && value !== null && '_zod' in value
}
