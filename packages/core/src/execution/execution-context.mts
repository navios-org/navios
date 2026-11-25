import type { ClassType, ScopedContainer } from '@navios/di'

import type { ContextKey, ContextValue } from './context-key.mjs'

export type AttributeMap = ReadonlyMap<symbol, unknown>

/**
 * The handler a context belongs to, the same for every transport: where it
 * is declared and what applies to it.
 */
export interface HandlerInfo {
  readonly module: ClassType | null
  /** The class that owns the handler. */
  readonly controller: ClassType
  readonly handlerName: string
  readonly guards: readonly ClassType[]
  readonly interceptors: readonly ClassType[]
  readonly attributes: {
    readonly handler: AttributeMap
    readonly controller: AttributeMap
    readonly module: AttributeMap
  }
}

/**
 * What every transport's context offers. A guard, interceptor or service
 * written against this works on any transport.
 */
export interface ExecutionContext {
  /** The transport kind, for example `'http'`. */
  readonly kind: string
  readonly id: string
  readonly signal: AbortSignal
  readonly handler: HandlerInfo
  /** Reads a slot; throws when a plain key is not set. */
  get<K extends ContextKey>(key: K): ContextValue<K>
  /** Like `get`, but `undefined` for a plain key that is not set. */
  find<K extends ContextKey>(key: K): ContextValue<K> | undefined
  set<K extends ContextKey>(key: K, value: ContextValue<K>): void
  has(key: ContextKey): boolean
  /** Resolves a service from this execution's DI scope, synchronously. */
  use: ScopedContainer['getSync']
  /** Resolves a service from this execution's DI scope. */
  resolve: ScopedContainer['get']
  /** Runs `callback` after the handler has finished, whatever the outcome. */
  onFinish(callback: () => void | Promise<void>): void
}
