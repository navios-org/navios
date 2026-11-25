/**
 * Whether `value` is an instance of the platform class called `name`, also of
 * another implementation of it (undici, a polyfill) and on a runtime that does
 * not have the class.
 */
export function isInstance(value: unknown, name: string): boolean {
  if (typeof value !== 'object' || value === null) return false
  if (Object.prototype.toString.call(value) === `[object ${name}]`) return true
  const platformClass = (globalThis as Record<string, unknown>)[name]
  return typeof platformClass === 'function' && value instanceof platformClass
}
