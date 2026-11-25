import type { StandardSchemaIssue } from '@navios/di'

/** As many characters of a value in a row tell something about it. */
const TELLING = 4
/** The same for a value that is one of many. */
const TELLING_OF_MANY = 8

type Path = NonNullable<StandardSchemaIssue['path']>

function keyOf(part: Path[number]): PropertyKey {
  return typeof part === 'object' ? part.key : part
}

/** Whether `message` has `length` characters of `value` in a row, or all it has. */
function tells(message: string, value: string, length: number): boolean {
  const text = value.toLowerCase()
  const size = Math.min(length, text.length)
  for (let start = 0; size > 0 && start + size <= text.length; start++) {
    if (message.includes(text.slice(start, start + size))) {
      return true
    }
  }
  return false
}

/** The texts in which something may appear in a message. */
function* texts(value: unknown, seen = new Set<unknown>()): Generator<string> {
  if (typeof value !== 'object' || value === null) {
    if (value !== undefined && value !== null && typeof value !== 'boolean') {
      yield String(value)
    }
    return
  }
  if (seen.has(value)) {
    return
  }
  seen.add(value)
  const { toJSON, toString } = value as { toJSON?: unknown; toString?: unknown }
  if (typeof toJSON === 'function') {
    yield String(toJSON.call(value))
  }
  if (typeof toString === 'function' && toString !== Object.prototype.toString) {
    yield String(value)
  }
  const inner = value instanceof Map || value instanceof Set ? value.values() : Object.values(value)
  for (const each of inner) {
    yield* texts(each, seen)
  }
}

function valueAt(loaded: unknown, path: Path): unknown {
  let value = loaded
  for (const part of path) {
    if (typeof value !== 'object' || value === null) {
      return undefined
    }
    value = (value as Record<PropertyKey, unknown>)[keyOf(part)]
  }
  return value
}

function mayContainValue(message: string, loaded: unknown, path: Path): boolean {
  const text = message.toLowerCase()
  const value = valueAt(loaded, path)
  if (typeof value === 'object' && value !== null) {
    return [...texts(value)].some(
      (part) => part.length >= TELLING && tells(text, part, TELLING_OF_MANY),
    )
  }
  if (value !== undefined) {
    return [...texts(value)].some((whole) => tells(text, whole, TELLING))
  }
  // Nothing is there, unless the schema moved what it validates. A word such as
  // `production` may well be in a message by itself.
  return [...texts(loaded)].some(
    (part) =>
      part.length >= TELLING && !/^[a-z]+$/i.test(part) && tells(text, part, TELLING_OF_MANY),
  )
}

/**
 * Says what is wrong with a configuration, without a value of it. Some schema
 * libraries put the value that they refuse into the message.
 */
export function describeIssue(
  { path = [], message }: StandardSchemaIssue,
  loaded: unknown,
): string {
  const at = path.map((part) => String(keyOf(part))).join('.')
  let isTold = false
  try {
    isTold = !mayContainValue(message, loaded, path)
  } catch {
    // What cannot be looked at cannot be told from the message either.
  }
  if (!isTold) {
    const subject = at === '' ? 'The configuration' : at
    return `${subject} is invalid. What the schema says about it may contain the value.`
  }
  return at === '' ? message : `${at}: ${message}`
}
