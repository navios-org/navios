import { misuse } from '../errors/create.mjs'

let nextObjectId = 0
const objectIds = new WeakMap<object, number>()
const symbolIds = new Map<symbol, number>()

function symbolId(value: symbol): number {
  let id = symbolIds.get(value)
  if (id === undefined) {
    id = ++nextObjectId
    symbolIds.set(value, id)
  }
  return id
}

function objectId(value: object): number {
  let id = objectIds.get(value)
  if (id === undefined) {
    id = ++nextObjectId
    objectIds.set(value, id)
  }
  return id
}

// The size up to which a typed array is serialised. It happens on every request
// with such args, and the key of a stored instance stays in memory.
const MAX_BYTES = 1024

// The objects around the one being serialised, outermost first.
const around: object[] = []

/**
 * Deterministic, collision-free key for a token's args.
 *
 * Plain objects, arrays, `Date`, `Map`, `Set`, `URL`, `RegExp` and typed
 * arrays of up to 1 kB are serialised by value: the order of keys does not
 * matter, and a property that is `undefined` counts as absent. Any other object
 * (class instances, functions) is keyed by identity.
 */
export function argsKey(value: unknown): string {
  around.length = 0
  return valueKey(value)
}

// The key an instance requested with `args` is stored under; `null` without args.
export function keyOf(args: unknown): string | null {
  return args === undefined ? null : argsKey(args)
}

function valueKey(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value)
    case 'number':
      return Object.is(value, -0) ? 'n-0' : `n${value}`
    case 'boolean':
      return value ? 'T' : 'F'
    case 'undefined':
      return 'U'
    case 'bigint':
      return `b${value}`
    case 'symbol':
      return `s${symbolId(value)}`
    case 'function':
      return `#${objectId(value)}`
    default:
  }
  if (value === null) {
    return 'N'
  }
  const object = value as object
  if (around.includes(object)) {
    throw misuse('Token args must not contain themselves')
  }
  around.push(object)
  const key = objectKey(object)
  around.pop()
  return key
}

function objectKey(object: object): string {
  const proto = Object.getPrototypeOf(object)
  if (proto === Object.prototype || proto === null) {
    return plainKey(object as Record<PropertyKey, unknown>)
  }
  if (Array.isArray(object)) {
    return `[${object.map((item) => valueKey(item)).join()}]`
  }
  // Only the built-in types themselves: a subclass may hold more than its
  // elements, and is keyed by identity like any other class instance.
  switch (proto) {
    case Date.prototype:
      return `D${(object as Date).getTime()}`
    case Map.prototype:
      return `M{${Array.from(object as Map<unknown, unknown>, ([k, v]) => `${valueKey(k)}:${valueKey(v)}`).sort()}}`
    case Set.prototype:
      return `S{${Array.from(object as Set<unknown>, (item) => valueKey(item)).sort()}}`
    case RegExp.prototype:
      return `R${JSON.stringify(String(object))}`
    case URL.prototype:
      return `L${JSON.stringify((object as URL).href)}`
    default:
  }
  if (
    ArrayBuffer.isView(object) &&
    !(object instanceof DataView) &&
    object.byteLength <= MAX_BYTES
  ) {
    return `A${object.constructor.name}(${Array.prototype.join.call(object)})`
  }
  return `#${objectId(object)}`
}

function plainKey(object: Record<PropertyKey, unknown>): string {
  const parts: string[] = []
  for (const key of Object.keys(object)) {
    if (object[key] !== undefined) {
      parts.push(`${JSON.stringify(key)}:${valueKey(object[key])}`)
    }
  }
  for (const symbol of Object.getOwnPropertySymbols(object)) {
    if (
      object[symbol] !== undefined &&
      Object.prototype.propertyIsEnumerable.call(object, symbol)
    ) {
      parts.push(`${valueKey(symbol)}:${valueKey(object[symbol])}`)
    }
  }
  return `{${parts.sort()}}`
}
