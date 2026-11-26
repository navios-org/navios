import { misuse } from '../errors/create.mjs'
import { InjectableScope } from '../injectable-scope.mjs'
import { abandonBuilds, settleHost } from '../internal/background.mjs'
import { destroyAll, destroyLoose, rejectWith } from '../internal/destruction.mjs'
import { EntryStatus } from '../internal/entry.mjs'
import { hookOwner } from '../internal/frame.mjs'
import { disposedError } from '../internal/liveness.mjs'
import { hasProvider, lookupRecord } from '../internal/normalize.mjs'
import { resolveInstance, resolveSyncOrThrow } from '../internal/resolution.mjs'
import { Store } from '../internal/store.mjs'
import { peek, storeValue } from '../internal/stored-values.mjs'
import { registerProvider } from '../provider/registration.mjs'
import { attachToken } from '../token/injectable-token.mjs'
import { InjectionToken } from '../token/injection-token.mjs'

import type {
  AsyncResolve,
  OptionalResolve,
  SyncResolve,
} from '../injection/resolve-signatures.mjs'
import type { Entry } from '../internal/entry.mjs'
import type { RootHost } from '../internal/host.mjs'
import type { ProvidedFor } from '../provider/factorable.mjs'
import type { ClassType } from '../token/class-type.mjs'
import type { AnyInjectableType, BoundInjectionToken } from '../token/injection-token.mjs'
import type { PublicPart } from '../token/public-part.mjs'

import { addInvalidateListener } from './invalidate-listener.mjs'

import type { Container } from './container.mjs'
import type { IContainer } from './i-container.mjs'

/**
 * A scope of a root container. Holds request-scoped instances; singletons are
 * resolved from, and stored in, the parent. `inject(ScopedContainer)` in a
 * request-scoped service gives the scope it belongs to.
 */
export class ScopedContainer implements IContainer {
  /** @internal */
  readonly root: RootHost
  /** @internal */
  readonly store = new Store()
  /** @internal */
  readonly isScope = true
  /** @internal */
  looseTransients: Entry[] | null = null
  /** @internal */
  background: Set<Promise<unknown>> | null = null
  /** @internal */
  building: Set<Entry> | null = null

  /** @internal */
  disposed = false

  private disposal: Promise<void> | null = null
  private metadata: Record<string, any> | undefined

  constructor(
    public readonly parent: Container,
    metadata?: Record<string, any>,
  ) {
    this.root = parent
    this.metadata = metadata
  }

  getMetadata(key: string): any | undefined {
    return this.metadata?.[key]
  }

  setMetadata(key: string, value: any): void {
    ;(this.metadata ??= {})[key] = value
  }

  // A scope refuses to resolve as soon as its own disposal starts, also for
  // what it holds: unlike the root container, even to a destroy hook.
  get: AsyncResolve = ((token: AnyInjectableType, args?: unknown) => {
    if (this.disposed) {
      return rejectWith(disposedError(this))
    }
    return resolveInstance(this, token, args)
  }) as AsyncResolve

  getSync: SyncResolve = ((token: AnyInjectableType, args?: unknown) => {
    if (this.disposed) {
      throw disposedError(this)
    }
    return resolveSyncOrThrow(this, token, args).instance
  }) as SyncResolve

  /** Returns an instance that is already built, or `null`. Never constructs. */
  declare peek: OptionalResolve

  addInstance<K extends ClassType | InjectionToken<any, any> | BoundInjectionToken<any, any>>(
    token: K,
    instance: PublicPart<ProvidedFor<K>>,
  ): void {
    storeValue(this, token, instance, InjectableScope.Request)
  }

  isRegistered(token: AnyInjectableType): boolean {
    return hasProvider(this, token)
  }

  /**
   * Destroys an instance this scope or its parent holds, after everything that
   * was built from it. The next resolution builds it again.
   */
  async invalidate(service: unknown): Promise<void> {
    if (service === this) {
      throw misuse('A scope cannot be invalidated; use dispose()')
    }
    const entries = this.store.findByInstance(service)
    if (entries.length === 0) {
      return this.parent.invalidate(service)
    }
    await destroyAll([...entries])
  }

  onInvalidate(token: AnyInjectableType, args: unknown, listener: () => void): () => void {
    return addInvalidateListener(
      this.root,
      (base) => {
        const record = lookupRecord(this, base)
        const scope = record === undefined ? base.scope : record.scope
        return scope === InjectableScope.Request || this.store.hasToken(base)
          ? this.store
          : this.parent.store
      },
      token,
      args,
      listener,
    )
  }

  ready(): Promise<void> {
    return settleHost(this)
  }

  /**
   * Destroys the transients this scope handed out, then every request-scoped
   * instance in reverse creation order, after waiting for those that are still
   * being created. Does no asynchronous work when nothing has a destroy hook.
   *
   * A second call returns the disposal in flight. A call from a lifecycle hook
   * of this scope does not wait for it, since the hook is part of what the
   * disposal waits for.
   */
  dispose(): Promise<void> {
    if (this.disposal === null) {
      this.disposed = true
      try {
        const builds = abandonBuilds(this)
        this.disposal =
          (builds === undefined ? this.destroyOwned() : builds.then(() => this.destroyOwned())) ??
          resolved
      } catch (error) {
        // An `onInvalidate` listener threw after a synchronous teardown.
        this.disposal = Promise.reject(error)
      }
    }
    if (hookOwner !== null && hookOwner.host === this) {
      this.disposal.catch((error) => this.root.reportError?.(error, 'Disposing the scope failed'))
      return resolved
    }
    return this.disposal
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.dispose()
  }

  private destroyOwned(): void | Promise<void> {
    if (this.store.size === 0 && this.looseTransients === null && this.background === null) {
      return
    }
    const entries = this.store.entries()
    if ((this.background !== null && this.background.size > 0) || entries.some(isCreating)) {
      return settleHost(this).then(() => this.destroyOwned())
    }
    const loose = destroyLoose(this)
    if (loose !== undefined) {
      return loose.then(() => destroyAll(entries))
    }
    return destroyAll(entries)
  }
}

ScopedContainer.prototype.peek = peek as OptionalResolve

const resolved: Promise<void> = Promise.resolve()

const isCreating = (entry: Entry): boolean => entry.status === EntryStatus.Creating

/**
 * Disposes `scope` as `dispose()` does, and returns `undefined` where that
 * returns a promise that is already fulfilled: nothing had a destroy hook that
 * returned a promise, and nothing was still being built (or it was called from
 * a lifecycle hook of the scope). A caller that disposes a scope per request
 * then needs no promise to wait on. Exported through `@navios/di/internal`.
 */
export function disposeScope(scope: ScopedContainer): Promise<void> | undefined {
  const disposal = scope.dispose()
  return disposal === resolved ? undefined : disposal
}

/** What `inject(ScopedContainer)` asks for. */
export const scopeToken = new InjectionToken<ScopedContainer, undefined>(
  ScopedContainer,
  undefined,
  InjectableScope.Request,
)
attachToken(ScopedContainer, scopeToken)
registerProvider(scopeToken, { factory: (ctx) => ctx.container as ScopedContainer })
