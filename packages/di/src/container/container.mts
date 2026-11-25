import { DIError } from '../errors/di-error.mjs'
import { InjectableScope } from '../injectable-scope.mjs'
import { destroyAll, destroyEntry } from '../internal/destruction.mjs'
import { EntryStatus } from '../internal/entry.mjs'
import { baseToken, hasProvider, lookupRecord } from '../internal/normalize.mjs'
import { resolveAsync, resolveSyncOrThrow } from '../internal/resolution.mjs'
import { Store } from '../internal/store.mjs'
import { peek, settleStore, storeValue } from '../internal/stored-values.mjs'
import { provide } from '../provider/provide.mjs'
import { registerInjectable } from '../provider/registration.mjs'

import type { AsyncResolve, SyncResolve } from '../injection/resolve-signatures.mjs'
import type { Entry } from '../internal/entry.mjs'
import type { InstanceDecorator, RootHost } from '../internal/host.mjs'
import type { Provider, ProviderInput } from '../provider/provide.mjs'
import type { ProviderRecord } from '../provider/provider-record.mjs'
import type { ClassType } from '../token/class-type.mjs'
import type {
  AnyInjectableType,
  BoundInjectionToken,
  InjectionToken,
} from '../token/injection-token.mjs'

import { addInvalidateListener } from './invalidate-listener.mjs'
import { ScopedContainer } from './scoped-container.mjs'

import type { IContainer } from './i-container.mjs'

export interface ContainerOptions {
  /** Providers that replace or supply the defaults registered on tokens. */
  providers?: Provider[]
  /**
   * Use only the providers given to this container and ignore the defaults
   * registered with `@Injectable`. Meant for isolated unit tests.
   */
  strict?: boolean
  logger?: Console | null
}

/**
 * The root container. Holds singletons and creates scopes.
 */
export class Container implements IContainer, RootHost {
  /** @internal */
  readonly root: RootHost = this
  /** @internal */
  readonly store = new Store()
  /** @internal */
  readonly isScope = false
  /** @internal */
  readonly facade: IContainer = this
  /** @internal */
  looseTransients: Entry[] | null = null
  /** @internal */
  readonly overrides = new Map<InjectionToken<any, any>, ProviderRecord>()
  /** @internal */
  decorators: Map<InjectionToken<any, any>, InstanceDecorator[]> | null = null
  /** @internal */
  readonly factoryValues: RootHost['factoryValues'] = new Map()
  /** @internal */
  readonly strict: boolean

  protected readonly logger: Console | null

  constructor(options: ContainerOptions = {}) {
    this.logger = options.logger ?? null
    this.strict = options.strict ?? false
    if (options.providers) {
      for (const provider of options.providers) {
        this.overrides.set(provider.token, provider.record)
      }
    }
    this.registerSelf()
  }

  /**
   * The provider a strict container uses for a token that is not among its
   * own. None by default.
   * @internal
   */
  providerForUnlisted(_token: InjectionToken<any, any>): ProviderRecord | undefined {
    return undefined
  }

  private registerSelf(): void {
    storeValue(this, Container, this, InjectableScope.Singleton)
  }

  get: AsyncResolve = ((token: AnyInjectableType, args?: unknown) => {
    const entry = peek(this, token, args)
    if (entry !== undefined) {
      return Promise.resolve(entry.instance)
    }
    return resolveAsync(this, token, args).then(instanceOf)
  }) as AsyncResolve

  getSync: SyncResolve = ((token: AnyInjectableType, args?: unknown) =>
    resolveSyncOrThrow(this, token, args).instance) as SyncResolve

  tryGetSync<T>(token: AnyInjectableType, args?: unknown): T | null {
    const entry = peek(this, token, args)
    return entry === undefined ? null : (entry.instance as T)
  }

  /**
   * Replaces or supplies the provider for a token in this container. Must be
   * called before the token is first resolved here.
   */
  provide<T>(token: ClassType | InjectionToken<T, any>, impl: ProviderInput<T>): void {
    const provider = provide(token, impl)
    if (this.store.hasToken(provider.token)) {
      throw DIError.unknown(
        `[DI] ${provider.token.toString()} is already resolved in this container; provide() must be called before its first resolution`,
      )
    }
    this.overrides.set(provider.token, provider.record)
  }

  /**
   * Wraps every instance of `token` after it is constructed and initialised
   * and before anything can observe it.
   */
  decorate<C extends ClassType>(
    token: C,
    decorator: (
      instance: InstanceType<C>,
      info: { token: InjectionToken<any, any>; args: unknown },
    ) => InstanceType<C>,
  ): void
  decorate<T>(
    token: InjectionToken<T, any>,
    decorator: (instance: T, info: { token: InjectionToken<any, any>; args: unknown }) => T,
  ): void
  decorate(
    token: ClassType | InjectionToken<any, any>,
    decorator: (instance: any, info: { token: InjectionToken<any, any>; args: unknown }) => any,
  ): void {
    const base = baseToken(token)
    if (base === undefined) {
      throw DIError.classNotInjectable((token as ClassType).name)
    }
    this.decorators ??= new Map()
    const list = this.decorators.get(base)
    if (list) {
      list.push(decorator as InstanceDecorator)
    } else {
      this.decorators.set(base, [decorator as InstanceDecorator])
    }
  }

  addInstance<T>(
    token: ClassType | InjectionToken<T, any> | BoundInjectionToken<T, any>,
    instance: T,
  ): void {
    storeValue(this, token, instance, InjectableScope.Singleton)
  }

  isRegistered(token: AnyInjectableType): boolean {
    return hasProvider(this, token)
  }

  /**
   * The provider that would be used for `token` in this container.
   */
  getProvider(token: ClassType | InjectionToken<any, any>): ProviderRecord | undefined {
    const base = baseToken(token)
    return base === undefined ? undefined : lookupRecord(this, base)
  }

  /**
   * Creates a scope for request-scoped services. Dispose it when the unit of
   * work ends, or use `await using scope = container.createScope()`.
   */
  createScope(metadata?: Record<string, any>): ScopedContainer {
    return new ScopedContainer(this, metadata)
  }

  /**
   * Every instance this container currently holds, in creation order. The
   * container itself is not included.
   */
  instances(): unknown[] {
    return this.store
      .entries()
      .filter((entry) => entry.status === EntryStatus.Ready && entry.instance !== this)
      .sort((left, right) => left.seq - right.seq)
      .map((entry) => entry.instance)
  }

  async invalidate(service: unknown): Promise<void> {
    const entry = this.store.findByInstance(service)
    if (entry === undefined || entry.status !== EntryStatus.Ready) {
      this.logger?.warn(`[Container] Service instance not found for invalidation`)
      return
    }
    await destroyEntry(entry)
  }

  onInvalidate(token: AnyInjectableType, args: unknown, listener: () => void): () => void {
    return addInvalidateListener(this, this.store, token, args, listener)
  }

  async ready(): Promise<void> {
    await settleStore(this.store)
  }

  async dispose(): Promise<void> {
    await settleStore(this.store)
    const self = this.store.findByInstance(this)
    await destroyAll(this.store.entries().filter((entry) => entry !== self))
    this.factoryValues.clear()
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose()
  }
}

registerInjectable(Container)

function instanceOf(entry: Entry): unknown {
  return entry.instance
}
