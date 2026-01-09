import type { AbstractAdapterInterface } from '../interfaces/index.mjs'

/**
 * Type guard to check if adapter implements a specific method.
 * Narrows the adapter type to include the method.
 *
 * @example
 * ```typescript
 * if (adapterSupports(adapter, 'getServer')) {
 *   const server = adapter.getServer() // TypeScript knows this exists
 * }
 * ```
 */
export function adapterSupports<
  TAdapter extends AbstractAdapterInterface,
  TMethod extends string,
>(
  adapter: TAdapter | null,
  method: TMethod,
): adapter is TAdapter & Record<TMethod, (...args: unknown[]) => unknown> {
  return (
    adapter !== null &&
    typeof (adapter as Record<string, unknown>)[method] === 'function'
  )
}

/**
 * Asserts adapter supports a method, throws if not.
 * Narrows type after assertion.
 *
 * @example
 * ```typescript
 * assertAdapterSupports(adapter, 'enableCors')
 * adapter.enableCors(options) // TypeScript knows this exists
 * ```
 */
export function assertAdapterSupports<
  TAdapter extends AbstractAdapterInterface,
  TMethod extends string,
>(
  adapter: TAdapter | null,
  method: TMethod,
): asserts adapter is TAdapter & Record<TMethod, (...args: unknown[]) => unknown> {
  if (!adapterSupports(adapter, method)) {
    throw new Error(`Current adapter does not implement '${method}()'`)
  }
}
