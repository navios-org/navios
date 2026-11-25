/**
 * A copy of a plain object or an array, so that an interceptor can change it in
 * place without changing what the caller passed. Anything else is returned as it is.
 */
export function copyPlain<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value
  if (Array.isArray(value)) return value.slice() as T
  const prototype: unknown = Object.getPrototypeOf(value)
  // The prototype of a plain object of another realm is not `Object.prototype`
  const plain = prototype === null || Object.getPrototypeOf(prototype) === null
  return plain ? { ...value } : value
}
