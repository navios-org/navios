/**
 * Values that come from user code (guards, handlers, interceptors, schemas)
 * may be thenables that are not native promises: query builders, promises of
 * another library, promises of another realm. Testing for a native promise
 * alone would take them for a finished value, which for a guard means
 * "allowed".
 *
 * Returns a native promise for any thenable and everything else unchanged, so
 * that the pipeline can keep testing with `instanceof Promise`.
 * @internal
 */
export function adopt<T>(value: T | PromiseLike<T>): T | Promise<T> {
  if (
    value instanceof Promise ||
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function') ||
    typeof (value as PromiseLike<T>).then !== 'function'
  ) {
    return value as T | Promise<T>
  }
  return Promise.resolve(value)
}

/** @internal */
export type MaybePromise<T> = T | Promise<T>

/** @internal */
export function isPromise<T>(value: MaybePromise<T>): value is Promise<T> {
  return value instanceof Promise
}

/**
 * Handles the rejection of a promise that is handed out, so that it is not an
 * unhandled one when nobody awaits it. Whoever does still sees it.
 * @internal
 */
export function ignore(): void {}
