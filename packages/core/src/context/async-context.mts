import type { RequestContext } from './request-context.mjs'

interface Storage {
  run<R>(store: RequestContext, fn: () => R): R
  getStore(): RequestContext | undefined
}

let storage: Storage | null = null

/**
 * Turns on the async context: one `AsyncLocalStorage` holding the current
 * `RequestContext`. Enabled by the `asyncContext: true` application option.
 * @internal
 */
export async function enableAsyncContext(): Promise<void> {
  if (storage === null) {
    const { AsyncLocalStorage } = await import('node:async_hooks')
    storage = new AsyncLocalStorage<RequestContext>()
  }
}

/** @internal */
export function runInContext<R>(ctx: RequestContext, fn: () => R): R {
  return storage === null ? fn() : storage.run(ctx, fn)
}

/** @internal */
export function isAsyncContextEnabled(): boolean {
  return storage !== null
}

/**
 * The context of the request being handled, for code that cannot receive it
 * as an argument. Returns `undefined` outside a request, and always when the
 * application was not created with `asyncContext: true`.
 */
export function currentContext(): RequestContext | undefined {
  return storage?.getStore()
}
