import { misuse } from '../errors/create.mjs'
import { InjectableScope } from '../injectable-scope.mjs'
import { instancesOf, readyEntries } from '../internal/access.mjs'
import { abandonBuilds, settleHost, settleStore } from '../internal/background.mjs'
import { destroyAll } from '../internal/destruction.mjs'
import { EntryStatus } from '../internal/entry.mjs'
import { hookOwner } from '../internal/frame.mjs'
import { assertLive } from '../internal/liveness.mjs'
import {
  baseToken,
  finalRecord,
  hasProvider,
  isResolved,
  lookupRecord,
  requireToken,
} from '../internal/normalize.mjs'
import { resolveInstance, resolveSyncOrThrow } from '../internal/resolution.mjs'
import { Store } from '../internal/store.mjs'
import { peek, storeValue } from '../internal/stored-values.mjs'
import { provide } from '../provider/provide.mjs'
import { registerInjectable } from '../provider/registration.mjs'
import { findInjectableToken } from '../token/injectable-token.mjs'

import type {
  AsyncResolve,
  OptionalResolve,
  SyncResolve,
} from '../injection/resolve-signatures.mjs'
import type { Entry } from '../internal/entry.mjs'
import type { ErrorReporter, InstanceDecorator, RootHost } from '../internal/host.mjs'
import type { ProvidedFor, ResolvedInstance } from '../provider/factorable.mjs'
import type { Provider, ProviderInputFor } from '../provider/provide.mjs'
import type { ProviderInfo, ProviderRecord } from '../provider/provider-record.mjs'
import type { AbstractClassType, ClassType } from '../token/class-type.mjs'
import type {
  AnyInjectableType,
  BoundInjectionToken,
  InjectionToken,
} from '../token/injection-token.mjs'
import type { PublicPart } from '../token/public-part.mjs'

import { addInvalidateListener } from './invalidate-listener.mjs'
import { ScopedContainer, scopeToken } from './scoped-container.mjs'

import type { IContainer } from './i-container.mjs'

export interface ContainerOptions {
  /** Providers that replace or supply the defaults registered on tokens. */
  providers?: Provider[]
  /**
   * Use only the providers given to this container and ignore the defaults
   * registered with `@Injectable`. Meant for isolated unit tests.
   */
  strict?: boolean
  /**
   * Told about errors nobody receives, such as those of destroy hooks. They go
   * to `console.error` without a logger and are dropped with `null`.
   */
  logger?: Console | null
}

// A condition on `K` for the same reason as in `ProviderInputFor`.
type DecoratorFor<K> = K extends unknown
  ? (
      instance: K extends AbstractClassType ? ResolvedInstance<K> : ProvidedFor<K>,
      info: { token: InjectionToken<any, any>; args: unknown },
    ) => ProvidedFor<K>
  : never

/**
 * The root container. Holds singletons and creates scopes.
 */
export class Container implements IContainer {
  /** @internal */
  readonly root: RootHost = this
  /** @internal */
  readonly store = new Store()
  /** @internal */
  readonly isScope = false
  /** @internal */
  disposed = false
  /** @internal */
  background: Set<Promise<unknown>> | null = null
  /** @internal */
  building: Set<Entry> | null = null
  /** @internal */
  readonly overrides = new Map<InjectionToken<any, any>, ProviderRecord>()
  /** @internal */
  decorators: Map<InjectionToken<any, any>, InstanceDecorator[]> | null = null
  /** @internal */
  usedAliases: Set<InjectionToken<any, any>> | null = null
  /** @internal */
  readonly factoryValues: RootHost['factoryValues'] = new Map()
  /** @internal */
  readonly strict: boolean
  /** @internal */
  reportError: ErrorReporter | null
  /**
   * Whether `reportError` is what the `logger` option asked for.
   * @internal
   */
  readonly hasOwnReporter: boolean

  protected readonly logger: Console | null

  private disposal: Promise<void> | null = null
  private staysUsable = false

  constructor(options: ContainerOptions = {}) {
    const { logger } = options
    this.logger = logger ?? null
    this.hasOwnReporter = logger !== undefined
    this.reportError =
      logger === null
        ? null
        : (error, description) => (logger ?? console).error(`[Container] ${description}`, error)
    this.strict = options.strict ?? false
    if (this.strict) {
      this.overrides.set(scopeToken, scopeToken.provider!)
    }
    if (options.providers) {
      for (const provider of options.providers) {
        this.overrides.set(provider.token, provider.record)
      }
    }
    storeValue(this, Container, this, InjectableScope.Singleton)
  }

  /**
   * The provider a strict container uses for a token that is not among its
   * own. None by default.
   * @internal
   */
  providerForUnlisted(_token: InjectionToken<any, any>): ProviderRecord | undefined {
    return undefined
  }

  get: AsyncResolve = ((token: AnyInjectableType, args?: unknown) => {
    return resolveInstance(this, token, args)
  }) as AsyncResolve

  getSync: SyncResolve = ((token: AnyInjectableType, args?: unknown) =>
    resolveSyncOrThrow(this, token, args).instance) as SyncResolve

  /** Returns an instance that is already built, or `null`. Never constructs. */
  declare peek: OptionalResolve

  /**
   * Replaces or supplies the provider for a token in this container. Must be
   * called before the token is first resolved here.
   */
  provide<K extends ClassType | InjectionToken<any, any>>(
    token: K,
    impl: ProviderInputFor<K>,
  ): void {
    const provider = provide(token, impl)
    this.assertUnresolved(provider.token, 'provide()')
    this.overrides.set(provider.token, provider.record)
  }

  private assertUnresolved(token: InjectionToken<any, any>, call: string): void {
    assertLive(this)
    if (isResolved(this, token)) {
      throw misuse(
        `${token} is already resolved in this container; ${call} must be called before its first resolution`,
      )
    }
  }

  /**
   * Wraps every instance of `token` after it is constructed and initialised
   * and before anything can observe it. Must be called before the token is
   * first resolved here.
   */
  decorate<K extends ClassType | InjectionToken<any, any>>(
    token: K,
    decorator: DecoratorFor<K>,
  ): void {
    const base = requireToken(token)
    this.assertUnresolved(base, 'decorate()')
    this.decorators ??= new Map()
    const list = this.decorators.get(base)
    if (list) {
      list.push(decorator as InstanceDecorator)
    } else {
      this.decorators.set(base, [decorator as InstanceDecorator])
    }
  }

  addInstance<K extends ClassType | InjectionToken<any, any> | BoundInjectionToken<any, any>>(
    token: K,
    instance: PublicPart<ProvidedFor<K>>,
  ): void {
    storeValue(this, token, instance, InjectableScope.Singleton)
  }

  isRegistered(token: AnyInjectableType): boolean {
    return hasProvider(this, token)
  }

  /**
   * The provider that would be used for `token` in this container.
   */
  getProvider(token: ClassType | InjectionToken<any, any>): ProviderInfo | undefined {
    const base = baseToken(token)
    const record = base === undefined ? undefined : lookupRecord(this, base)
    if (record === undefined) {
      return undefined
    }
    const { kind, scope, target } = record
    if (kind !== 'existing') {
      return { kind, scope, target }
    }
    // An alias has the scope of what it points to.
    return { kind, scope: finalRecord(this, token)?.scope ?? scope, target }
  }

  /**
   * Creates a scope for request-scoped services. Dispose it when the unit of
   * work ends, or use `await using scope = container.createScope()`.
   */
  createScope(metadata?: Record<string, any>): ScopedContainer {
    assertLive(this)
    return new ScopedContainer(this, metadata)
  }

  /**
   * Every instance this container currently holds, in the order in which they
   * became ready: dependencies before their dependents. An object that several
   * tokens stand for is listed once. The container itself is not included.
   */
  instances(): unknown[] {
    return instancesOf(readyEntries(this))
  }

  /**
   * Destroys an instance this container holds, after everything that was built
   * from it. The next resolution builds it again.
   */
  async invalidate(service: unknown): Promise<void> {
    if (service === this) {
      throw misuse('A container cannot be invalidated; use dispose()')
    }
    const entries = this.store.findByInstance(service)
    if (entries.length === 0) {
      this.logger?.warn(`[Container] Service instance not found for invalidation`)
      return
    }
    await destroyAll([...entries])
  }

  onInvalidate(token: AnyInjectableType, args: unknown, listener: () => void): () => void {
    return addInvalidateListener(this, () => this.store, token, args, listener)
  }

  async ready(): Promise<void> {
    await settleStore(this.store)
  }

  /**
   * Destroys every instance in reverse creation order, after waiting for those
   * that are still being created. Nothing can be built here afterwards, and
   * a resolution in flight fails with `ContainerDisposed`.
   *
   * A second call returns the disposal in flight. A call from a lifecycle hook
   * does not wait for it, since the hook is part of what the disposal waits for.
   */
  dispose(): Promise<void> {
    this.staysUsable = false
    this.disposal ??= this.destroyEverything()
    if (hookOwner !== null && hookOwner.host.root === this.root) {
      this.disposal.catch((error) => this.reportError?.(error, 'Disposing the container failed'))
      return Promise.resolve()
    }
    return this.disposal
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.dispose()
  }

  /**
   * Destroys what `dispose()` does and leaves the container usable.
   * @internal
   */
  protected reset(): Promise<void> {
    if (this.disposal === null) {
      this.staysUsable = true
      this.disposal = this.destroyEverything()
    }
    return this.disposal
  }

  private async destroyEverything(): Promise<void> {
    this.disposed = true
    const self = this.store.get(findInjectableToken(Container)!, null)!
    await abandonBuilds(this)
    await settleHost(this)
    try {
      await destroyAll(this.store.entries().filter((entry) => entry !== self))
      await destroyAll(
        Array.from(this.factoryValues.values()).filter(
          (value) => value.status !== EntryStatus.Creating,
        ),
      )
      await settleHost(this)
    } finally {
      this.factoryValues.clear()
      this.usedAliases = null
      if (this.staysUsable) {
        this.disposed = false
        this.disposal = null
      } else {
        this.store.delete(self)
      }
    }
  }
}

// A method with the overloads of `OptionalResolve`.
Container.prototype.peek = peek as OptionalResolve

registerInjectable(Container)
