import { InjectableScope } from '../enums/index.mjs'
import { DIError } from '../errors/di-error.mjs'
import {
  baseToken,
  destroyAll,
  destroyEntry,
  hasProvider,
  lookupRecord,
  peek,
  resolveAsync,
  resolveSyncOrThrow,
  settleStore,
  storeValue,
} from '../internal/engine.mjs'
import { EntryStatus, Store } from '../internal/entry.mjs'

import type { IContainer } from '../interfaces/container.interface.mjs'
import type { Host, RootHost } from '../internal/engine.mjs'
import type { Entry } from '../internal/entry.mjs'
import type {
  AnyInjectableType,
  BoundInjectionToken,
  ClassType,
  InjectionToken,
} from '../token/injection-token.mjs'
import type { AsyncResolve, SyncResolve } from '../utils/types.mjs'

import { addInvalidateListener } from './container.mjs'

import type { Container } from './container.mjs'

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

  private disposed = false
  private metadata: Record<string, any> | undefined

  constructor(
    public readonly parent: Container,
    metadata?: Record<string, any>,
  ) {
    this.root = parent
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
    return addInvalidateListener(local ? this.store : this.parent.store, token, args, listener)
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
    const result = this.destroyOwned()
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
    return destroyAll(entries)
  }
}

const resolved: Promise<void> = Promise.resolve()

function instanceOf(entry: Entry): unknown {
  return entry.instance
}
