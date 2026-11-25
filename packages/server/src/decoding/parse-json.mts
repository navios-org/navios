/**
 * Text that may hold a key which reaches the prototype of an object it is
 * copied to: as it is, or with escapes in it.
 */
const SUSPECT = /__proto__|constructor|\\u/

/**
 * Parses the JSON of a request, and refuses `__proto__` and
 * `constructor.prototype` as keys: code that merges such a value into an
 * object would change the prototype of that object, or of every object. The
 * messages of the errors are for the client.
 */
export function parseJson(text: string): unknown {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    // The engine's message differs between runtimes and quotes the body.
    throw new Error('Malformed JSON body')
  }
  if (SUSPECT.test(text)) {
    assertPlainKeys(value)
  }
  return value
}

function assertPlainKeys(root: unknown): void {
  const pending = [root]
  while (pending.length > 0) {
    const value = pending.pop()
    if (typeof value !== 'object' || value === null) {
      continue
    }
    if (!Array.isArray(value)) {
      const { constructor } = value as Record<string, unknown>
      if (
        Object.hasOwn(value, '__proto__') ||
        (Object.hasOwn(value, 'constructor') &&
          typeof constructor === 'object' &&
          constructor !== null &&
          Object.hasOwn(constructor, 'prototype'))
      ) {
        throw new Error('The JSON body has a key that is not allowed')
      }
    }
    for (const member of Object.values(value)) {
      pending.push(member)
    }
  }
}
