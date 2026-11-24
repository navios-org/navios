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

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Deterministic, collision-free key for a token's args.
 *
 * Plain objects and arrays are serialised structurally with sorted keys, so
 * key order does not matter. Anything else that is an object (class instances,
 * functions, Maps, Dates) is keyed by identity.
 */
export function argsKey(value: unknown): string {
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
  if (Array.isArray(object)) {
    let out = '['
    for (let i = 0; i < object.length; i++) {
      out += (i === 0 ? '' : ',') + argsKey(object[i])
    }
    return `${out}]`
  }
  if (!isPlainObject(object)) {
    return `#${objectId(object)}`
  }
  const keys = Object.keys(object).sort()
  let out = '{'
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    out += `${i === 0 ? '' : ','}${JSON.stringify(key)}:${argsKey((object as Record<string, unknown>)[key])}`
  }
  return `${out}}`
}
