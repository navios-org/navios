/**
 * Interface matching the subset of AsyncLocalStorage API we use.
 */
export interface IAsyncLocalStorage<T> {
  run<R>(store: T, fn: () => R): R
  getStore(): T | undefined
}

