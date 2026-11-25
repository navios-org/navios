import type { ExecutionContext } from './execution-context.mjs'

interface Storage {
  run<R>(store: ExecutionContext, fn: () => R): R
  getStore(): ExecutionContext | undefined
}

let storage: Storage | null = null

/**
 * Turns on the async context: one `AsyncLocalStorage` holding the current
 * `ExecutionContext`. The `asyncContext: true` option of an application does it.
 */
export async function enableAsyncContext(): Promise<void> {
  if (storage === null) {
    const { AsyncLocalStorage } = await import('node:async_hooks')
    storage = new AsyncLocalStorage<ExecutionContext>()
  }
}

/**
 * Runs `fn` with `ctx` as the current context. A transport does this when its
 * host says that the application has an async context.
 */
export function runInContext<R>(ctx: ExecutionContext, fn: () => R): R {
  return storage === null ? fn() : storage.run(ctx, fn)
}

/**
 * The context of the handler being run, for code that cannot receive it as an
 * argument. Returns `undefined` outside a handler, and always when the
 * application was not created with `asyncContext: true`.
 */
export function currentContext(): ExecutionContext | undefined {
  return storage?.getStore()
}
