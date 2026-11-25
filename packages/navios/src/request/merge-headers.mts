/** Everything headers can be given as. `undefined` and `null` values are left out. */
export type HeadersSource =
  | Headers
  | Record<string, string | number | boolean | null | undefined>
  | readonly (readonly [name: string, value: string])[]

function entriesOf(source: HeadersSource): Iterable<readonly [string, unknown]> {
  if (Array.isArray(source)) return source
  // `Headers` of any implementation
  const { entries } = source as Headers
  return typeof entries === 'function' ? entries.call(source) : Object.entries(source)
}

/**
 * Merges headers; a later source replaces a header of the same name. Names are
 * lower-cased, because two spellings of one name would both be sent, joined
 * into one value.
 */
export function mergeHeaders(
  ...sources: (HeadersSource | null | undefined)[]
): Record<string, string> {
  const merged: Record<string, string> = {}
  for (const source of sources) {
    if (!source) continue
    for (const [name, value] of entriesOf(source)) {
      if (value === undefined || value === null) continue
      merged[name.toLowerCase()] = String(value)
    }
  }
  return merged
}

/** A member every object has keeps its name: `hasOwnProperty` is not a header. */
function keyOf(name: string | symbol): string | symbol {
  return typeof name === 'string' && !(name in Object.prototype) ? name.toLowerCase() : name
}

const ANY_CASE: ProxyHandler<Record<string, string>> = {
  get: (headers, name) => Reflect.get(headers, keyOf(name)),
  set: (headers, name, value) => Reflect.set(headers, keyOf(name), value),
  has: (headers, name) => Reflect.has(headers, keyOf(name)),
  deleteProperty: (headers, name) => Reflect.deleteProperty(headers, keyOf(name)),
  defineProperty: (headers, name, descriptor) =>
    Reflect.defineProperty(headers, keyOf(name), descriptor),
  getOwnPropertyDescriptor: (headers, name) =>
    Reflect.getOwnPropertyDescriptor(headers, keyOf(name)),
}

/**
 * Merges headers into a record whose entries are read, set and deleted by a
 * name in any case. Its keys are lower-case.
 */
export function headerRecord(
  ...sources: (HeadersSource | null | undefined)[]
): Record<string, string> {
  return new Proxy(mergeHeaders(...sources), ANY_CASE)
}
