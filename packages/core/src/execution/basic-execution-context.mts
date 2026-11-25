import type { AnyInjectableType, Container, ScopedContainer } from '@navios/di'

import { needsScope } from './context-host.mjs'
import { ExecutionContextToken } from './execution-context-token.mjs'

import type { ContextHost } from './context-host.mjs'
import type { ContextKey, ContextValue } from './context-key.mjs'
import type { ExecutionContext, HandlerInfo } from './execution-context.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface BasicExecutionContextInit {
  /** The transport kind, for example `'cli'`. */
  kind: string
  id: string
  handler: HandlerInfo
  host: ContextHost
  /** Defaults to a signal of the context's own that never aborts. */
  signal?: AbortSignal
}

/**
 * An `ExecutionContext` for transports that need nothing beyond the neutral
 * contract. The transport creates one per execution and calls `finish()` when
 * the handler is done.
 */
export class BasicExecutionContext implements ExecutionContext {
  readonly kind: string
  readonly id: string
  readonly handler: HandlerInfo
  private readonly host: ContextHost
  private readonly givenSignal: AbortSignal | undefined
  private ownSignal: AbortSignal | null = null
  private slots: Map<ContextKey, unknown> | null = null
  private scope: ScopedContainer | null = null
  private finishers: Array<() => void | Promise<void>> | null = null
  private finished = false
  private finishing: Promise<void> | null = null

  constructor(init: BasicExecutionContextInit) {
    this.kind = init.kind
    this.id = init.id
    this.handler = init.handler
    this.host = init.host
    this.givenSignal = init.signal
  }

  /** Not shared between contexts: listeners would outlive their execution. */
  get signal(): AbortSignal {
    return this.givenSignal ?? (this.ownSignal ??= new AbortController().signal)
  }

  get<K extends ContextKey>(key: K): ContextValue<K> {
    const slots = this.slots
    if (slots === null || !slots.has(key)) {
      throw new Error(
        `[Navios] Context key ${key.name} is not set. ` +
          `Set it with ctx.set() (usually in a guard), or read it with ctx.find().`,
      )
    }
    return slots.get(key) as ContextValue<K>
  }

  find<K extends ContextKey>(key: K): ContextValue<K> | undefined {
    return this.slots?.get(key) as ContextValue<K> | undefined
  }

  set<K extends ContextKey>(key: K, value: ContextValue<K>): void {
    ;(this.slots ??= new Map()).set(key, value)
  }

  has(key: ContextKey): boolean {
    return this.slots?.has(key) ?? false
  }

  /**
   * What resolves a token for this execution: its DI scope, which is created
   * when something needs it.
   * @internal
   */
  resolverFor(token: AnyInjectableType): Container | ScopedContainer {
    const { container } = this.host
    if (this.scope === null && !needsScope(container, token)) {
      return container
    }
    this.host.onScopedUse?.(token)
    if (this.scope === null) {
      if (this.finished) {
        throw new Error(
          '[Navios] Request-scoped services cannot be used: the execution has finished, so ' +
            'nothing would dispose them.',
        )
      }
      this.scope = container.createScope()
      this.scope.addInstance(ExecutionContextToken, this)
    }
    return this.scope
  }

  declare use: ScopedContainer['getSync']

  declare resolve: ScopedContainer['get']

  onFinish(callback: () => void | Promise<void>): void {
    if (this.finished) {
      void this.runFinisher(callback)
      return
    }
    ;(this.finishers ??= []).push(callback)
  }

  /**
   * Runs the `onFinish` callbacks in reverse order, those they register
   * included, then disposes the DI scope. Runs once, however often it is
   * called; every caller waits for that run.
   */
  finish(): Promise<void> {
    return (this.finishing ??= this.runFinishers())
  }

  private async runFinishers(): Promise<void> {
    let finisher: (() => void | Promise<void>) | undefined
    while ((finisher = this.finishers?.pop()) !== undefined) {
      await this.runFinisher(finisher)
    }
    this.finished = true
    this.ownSignal = null
    const scope = this.scope
    this.scope = null
    if (scope !== null) {
      await scope.dispose()
    }
  }

  /** Runs a callback whose failure must not stop what follows. */
  private async runFinisher(callback: () => void | Promise<void>): Promise<void> {
    try {
      await callback()
    } catch (error) {
      // A failing callback must not stop the others, so it is only reported.
      try {
        this.host.logger?.error(`Error in an onFinish callback of ${this.kind} ${this.id}`, error)
      } catch {
        // Nor may a failing logger.
      }
    }
  }
}

BasicExecutionContext.prototype.use = function use(
  this: BasicExecutionContext,
  token: AnyInjectableType,
  args?: unknown,
) {
  return (this.resolverFor(token).getSync as any)(token, args)
} as ScopedContainer['getSync']

BasicExecutionContext.prototype.resolve = function resolve(
  this: BasicExecutionContext,
  token: AnyInjectableType,
  args?: unknown,
) {
  return (this.resolverFor(token).get as any)(token, args)
} as ScopedContainer['get']
