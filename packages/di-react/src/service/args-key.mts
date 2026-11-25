let nextId = 0
const objectIds = new WeakMap<object, number>()

/** What the container compares by value, and JSON would leave out. */
function replacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint' || value instanceof RegExp) {
    return { [typeof value]: String(value) }
  }
  if (value instanceof Map || value instanceof Set) {
    return { [value.constructor.name]: Array.from(value as Iterable<unknown>) }
  }
  return value
}

/**
 * Key that identifies the args of a hook call. Args that serialize to the same
 * JSON share a key, so an object literal written in the call, or a function in
 * it, does not count as a change on every render.
 *
 * Args JSON cannot serialize, which contain themselves, are keyed by identity.
 */
export function getArgsKey(args: unknown): string {
  try {
    return JSON.stringify(args, replacer) ?? ''
  } catch {
    const object = args as object
    let id = objectIds.get(object)
    if (id === undefined) {
      id = ++nextId
      objectIds.set(object, id)
    }
    return `#${id}`
  }
}
