let nextId = 0
const objectIds = new WeakMap<object, number>()

/**
 * Key that identifies the args of a hook call. Args that serialize to the same
 * JSON share a key, so an object literal written in the call does not count as
 * a change on every render.
 *
 * Values JSON cannot serialize (a cycle, a bigint) are keyed by identity.
 */
export function getArgsKey(args: unknown): string {
  try {
    return JSON.stringify(args) ?? ''
  } catch {
    if ((typeof args === 'object' && args !== null) || typeof args === 'function') {
      let id = objectIds.get(args)
      if (id === undefined) {
        id = ++nextId
        objectIds.set(args, id)
      }
      return `#${id}`
    }
    return `${typeof args}:${String(args)}`
  }
}
