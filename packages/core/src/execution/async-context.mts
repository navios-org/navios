import type { ExecutionContext } from './execution-context.mjs'

interface Storage {
  run<R>(store: ExecutionContext, fn: () => R): R
  getStore(): ExecutionContext | undefined
}

let storage: Storage | null = null

/**
 * Turns on the async context: one `AsyncLocalStorage` holding the current
 * `ExecutionContext`. Enabled by the `asyncContext: true` application option.
 * @internal
 */
export async function enableAsyncContext(): Promise<void> {
  if (storage === null) {
    const { AsyncLocalStorage } = await import('node:async_hooks')
    storage = new AsyncLocalStorage<ExecutionContext>()
  }
}

/** @internal */
export function runInContext<R>(ctx: ExecutionContext, fn: () => R): R {
  return storage === null ? fn() : storage.run(ctx, fn)
}

/** @internal */
export function isAsyncContextEnabled(): boolean {
  return storage !== null
}

/**
 * The context of the handler being run, for code that cannot receive it as an
 * argument. Returns `undefined` outside a handler, and always when the
 * application was not created with `asyncContext: true`.
 */
export function currentContext(): ExecutionContext | undefined {
  return storage?.getStore()
}
