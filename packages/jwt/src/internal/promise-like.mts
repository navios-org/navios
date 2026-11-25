export function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as PromiseLike<T> | null | undefined)?.then === 'function'
}
