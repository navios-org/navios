import { DIError } from '../errors/di-error.mjs'
import { InjectableScope } from '../injectable-scope.mjs'
import { destroyAll, destroyEntry } from '../internal/destruction.mjs'
import { EntryStatus } from '../internal/entry.mjs'
import { baseToken, hasProvider, lookupRecord } from '../internal/normalize.mjs'
import { resolveAsync, resolveSyncOrThrow } from '../internal/resolution.mjs'
import { Store } from '../internal/store.mjs'
import { peek, settleStore, storeValue } from '../internal/stored-values.mjs'

import type { AsyncResolve, SyncResolve } from '../injection/resolve-signatures.mjs'
import type { Entry } from '../internal/entry.mjs'
import type { Host, RootHost } from '../internal/host.mjs'
import type { ClassType } from '../token/class-type.mjs'
import type {
  AnyInjectableType,
  BoundInjectionToken,
  InjectionToken,
} from '../token/injection-token.mjs'

import { addInvalidateListener } from './invalidate-listener.mjs'

import type { Container } from './container.mjs'
import type { IContainer } from './i-container.mjs'

/**
 * A scope of a root container. Holds request-scoped instances; singletons are
 * resolved from, and stored in, the parent.
 */
export class ScopedContainer implements IContainer, Host {
  /** @internal */
  readonly root: RootHost
  /** @internal */
  readonly store = new Store()
  /** @internal */
  readonly isScope = true
  /** @internal */
  readonly facade: IContainer = this
  /** @internal */
  looseTransients: Entry[] | null = null

  /** @internal */
  disposed = false

  private metadata: Record<string, any> | undefined

  constructor(
    public readonly parent: Container,
    metadata?: Record<string, any>,
  ) {
    this.root = parent
    this.store.report = parent.store.report
    this.metadata = metadata
  }

  getParent(): Container {
    return this.parent
  }

  getMetadata(key: string): any | undefined {
    return this.metadata?.[key]
  }

  setMetadata(key: string, value: any): void {
    ;(this.metadata ??= {})[key] = value
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw DIError.containerDisposed('ScopedContainer')
    }
  }

  get: AsyncResolve = ((token: AnyInjectableType, args?: unknown) => {
    if (this.disposed) {
      return Promise.reject(DIError.containerDisposed('ScopedContainer'))
    }
    const entry = peek(this, token, args)
    if (entry !== undefined) {
      return Promise.resolve(entry.instance)
    }
    return resolveAsync(this, token, args).then(instanceOf)
  }) as AsyncResolve

  getSync: SyncResolve = ((token: AnyInjectableType, args?: unknown) => {
    this.assertUsable()
    return resolveSyncOrThrow(this, token, args).instance
  }) as SyncResolve

  tryGetSync<T>(token: AnyInjectableType, args?: unknown): T | null {
    const entry = peek(this, token, args)
    return entry === undefined ? null : (entry.instance as T)
  }

  addInstance<T>(
    token: ClassType | InjectionToken<T, any> | BoundInjectionToken<T, any>,
    instance: T,
  ): void {
    this.assertUsable()
    storeValue(this, token, instance, InjectableScope.Request)
  }

  isRegistered(token: AnyInjectableType): boolean {
    return hasProvider(this, token)
  }

  async invalidate(service: unknown): Promise<void> {
    const entry = this.store.findByInstance(service)
    if (entry === undefined || entry.status !== EntryStatus.Ready) {
      return this.parent.invalidate(service)
    }
    await destroyEntry(entry)
  }

  onInvalidate(token: AnyInjectableType, args: unknown, listener: () => void): () => void {
    const base = baseToken(token)
    const record = base === undefined ? undefined : lookupRecord(this, base)
    const local =
      (base !== undefined && this.store.hasToken(base)) ||
      record?.scope === InjectableScope.Request ||
      (record === undefined && base?.scope === InjectableScope.Request)
    return addInvalidateListener(
      this.root,
      local ? this.store : this.parent.store,
      token,
      args,
      listener,
    )
  }

  async ready(): Promise<void> {
    await settleStore(this.store)
  }

  /**
   * Destroys every request-scoped instance in reverse creation order. Does
   * no asynchronous work when nothing has a destroy hook.
   */
  dispose(): Promise<void> {
    if (this.disposed) {
      return resolved
    }
    this.disposed = true
    let result: void | Promise<void>
    try {
      result = this.destroyOwned()
    } catch (error) {
      // An `onInvalidate` listener threw after a synchronous teardown.
      return Promise.reject(error)
    }
    return result === undefined ? resolved : result
  }

  /** @deprecated Use `dispose()`. */
  endRequest(): Promise<void> {
    return this.dispose()
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.dispose()
  }

  private destroyOwned(): void | Promise<void> {
    if (this.store.size === 0 && this.looseTransients === null) {
      return
    }
    const entries = this.store.entries()
    if (entries.some((entry) => entry.status === EntryStatus.Creating)) {
      return settleStore(this.store).then(() => this.destroyOwned())
    }
    if (this.looseTransients !== null) {
      entries.push(...this.looseTransients)
      this.looseTransients = null
    }
    return destroyAll(entries, this.store.report)
  }
}

const resolved: Promise<void> = Promise.resolve()

function instanceOf(entry: Entry): unknown {
  return entry.instance
}
