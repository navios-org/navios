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
import { argsKey } from '../internal/args-key.mjs'
import { EntryStatus, Store } from '../internal/entry.mjs'
import { validateSync } from '../schema/standard-schema.mjs'
import { provide, registerInjectable } from '../token/provider.mjs'

import type { IContainer } from '../interfaces/container.interface.mjs'
import type { InstanceDecorator, RootHost } from '../internal/engine.mjs'
import type { Entry } from '../internal/entry.mjs'
import type {
  AnyInjectableType,
  BoundInjectionToken,
  ClassType,
  InjectionToken,
} from '../token/injection-token.mjs'
import type { Provider, ProviderInput, ProviderRecord } from '../token/provider.mjs'
import type { AsyncResolve, SyncResolve } from '../utils/types.mjs'

import { ScopedContainer } from './scoped-container.mjs'

export interface ContainerOptions {
  /** Providers that replace or supply the defaults registered on tokens. */
  providers?: Provider[]
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

  protected readonly logger: Console | null

  constructor(options: ContainerOptions = {}) {
    this.logger = options.logger ?? null
    if (options.providers) {
      for (const provider of options.providers) {
        this.overrides.set(provider.token, provider.record)
      }
    }
    this.registerSelf()
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
  decorate<T>(
    token: ClassType | InjectionToken<T, any>,
    decorator: (instance: T, info: { token: InjectionToken<any, any>; args: unknown }) => T,
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

  async invalidate(service: unknown): Promise<void> {
    const entry = this.store.findByInstance(service)
    if (entry === undefined || entry.status !== EntryStatus.Ready) {
      this.logger?.warn(`[Container] Service instance not found for invalidation`)
      return
    }
    await destroyEntry(entry)
  }

  onInvalidate(token: AnyInjectableType, args: unknown, listener: () => void): () => void {
    return addInvalidateListener(this.store, token, args, listener)
  }

  async ready(): Promise<void> {
    await settleStore(this.store)
  }

  async dispose(): Promise<void> {
    await settleStore(this.store)
    const self = this.store.findByInstance(this)
    await destroyAll(this.store.entries().filter((entry) => entry !== self))
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose()
  }
}

registerInjectable(Container)

function instanceOf(entry: Entry): unknown {
  return entry.instance
}

/** @internal */
export function addInvalidateListener(
  store: Store,
  token: AnyInjectableType,
  args: unknown,
  listener: () => void,
): () => void {
  const base = baseToken(token)
  if (base === undefined) {
    throw DIError.classNotInjectable((token as ClassType).name)
  }
  let resolvedArgs = args
  if (typeof token !== 'function' && 'value' in (token as BoundInjectionToken<any, any>)) {
    resolvedArgs = (token as BoundInjectionToken<any, any>).value
  }
  return store.addListener(base, keyFor(base, resolvedArgs), listener)
}

function keyFor(token: InjectionToken<any, any>, args: unknown): string | null {
  let value = args
  if (token.schema !== undefined) {
    try {
      value = validateSync(token.schema, args, token.toString())
    } catch {
      // Listen under the raw args; nothing will be stored there, which is the
      // same as the instance never existing.
    }
  }
  return value === undefined ? null : argsKey(value)
}
