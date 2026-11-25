import type { HttpClientError } from '../http-client-error.mjs'

export interface Interceptor<T> {
  onFulfilled?: ((value: T) => T | void | Promise<T | void>) | null
  onRejected?: ((error: HttpClientError) => unknown) | null
}

export interface InterceptorManager<T> {
  /**
   * Adds an interceptor. `onFulfilled` may change the value, or return another
   * one. `onRejected` receives the failure of any step before it; what it
   * returns takes the place of the result, so rethrow what is not handled. For
   * a request that is the config to send, and there has to be one. The client's own failures are {@link HttpClientError}s, what another
   * interceptor throws arrives as it was thrown.
   *
   * @returns the id to pass to `eject`
   */
  use(
    onFulfilled?: Interceptor<T>['onFulfilled'],
    onRejected?: Interceptor<T>['onRejected'],
  ): number
  eject(id: number): void
  clear(): void
}

export interface InterceptorChain<T> extends InterceptorManager<T> {
  /** Runs the interceptors, in the order they were added, on a pending value. */
  run(pending: Promise<T>): Promise<T>
}

export function createInterceptorChain<T>(): InterceptorChain<T> {
  let lastId = 0
  const interceptors = new Map<number, Interceptor<T>>()

  return {
    use(onFulfilled, onRejected) {
      interceptors.set(++lastId, { onFulfilled, onRejected })
      return lastId
    },
    eject(id) {
      interceptors.delete(id)
    },
    clear() {
      interceptors.clear()
    },
    run(pending) {
      let result = pending
      for (const { onFulfilled, onRejected } of interceptors.values()) {
        result = result.then(
          onFulfilled ? async (value) => (await onFulfilled(value)) ?? value : undefined,
          onRejected as ((error: unknown) => T) | undefined,
        )
      }
      return result
    },
  }
}
