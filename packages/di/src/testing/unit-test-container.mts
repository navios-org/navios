import { Container } from '../container/container.mjs'
import { ScopedContainer } from '../container/scoped-container.mjs'
import { DIError, DIErrorCode } from '../errors/di-error.mjs'
import { InjectableScope } from '../injectable-scope.mjs'
import { baseToken } from '../internal/lookup.mjs'
import { provide } from '../provider/provide.mjs'
import { attachToken, findInjectableToken } from '../token/injectable-token.mjs'
import { BoundInjectionToken, InjectionToken } from '../token/injection-token.mjs'

import type { AsyncResolve, SyncResolve } from '../injection/resolve-signatures.mjs'
import type { ProvidedForInstance } from '../provider/factorable.mjs'
import type { FactoryContext } from '../provider/factory-context.mjs'
import type { ProviderRecord } from '../provider/provider-record.mjs'
import type { ClassTypeWithInstance } from '../token/class-type.mjs'
import type { AnyInjectableType } from '../token/injection-token.mjs'
import type { PublicPart } from '../token/public-part.mjs'

import { createAutoMockProxy } from './auto-mock.mjs'
import { createTrackingProxy } from './call-tracking.mjs'
import { TrackingContainer } from './tracking-container.mjs'

import type { AnyToken, Token } from './tracking-container.mjs'

/**
 * Provider configuration for UnitTestContainer.
 */
export interface ProviderConfig<T = any> {
  token: InjectionToken<T, any> | BoundInjectionToken<T, any> | (new (...args: any[]) => T)
  useValue?: Given<T>
  useClass?: ClassTypeWithInstance<Given<T>>
  useFactory?: (ctx: FactoryContext, args: any) => Given<T> | Promise<Given<T>>
}

/**
 * What may stand in for a `T`. TypeScript infers the list of providers before
 * it looks at their tokens, so what is written into the list arrives with its
 * literals and tuples widened, and is compared as such.
 */
type Given<T> = Wide<PublicPart<ProvidedForInstance<NotInferred<T>>>>

/** `T`, in a place that says nothing about what `T` is when it is inferred. */
type NotInferred<T> = [T][T extends unknown ? 0 : never]

type Wide<T> = T | Widened<T>

type Widened<T> = unknown extends T
  ? T
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Widened<R>
    : T extends Promise<infer V>
      ? Promise<Widened<V>>
      : T extends readonly unknown[]
        ? readonly Widened<T[number]>[]
        : T extends object
          ? { [K in keyof T]: Widened<T[K]> }
          : T extends string
            ? string
            : T extends number
              ? number
              : T extends boolean
                ? boolean
                : T

/**
 * Options for UnitTestContainer.
 */
export interface UnitTestContainerOptions<Provided extends readonly unknown[] = any[]> {
  /**
   * List of providers to register. Only these services can be resolved.
   */
  providers: { readonly [K in keyof Provided]: ProviderConfig<Provided[K]> }

  /**
   * If true, unregistered dependencies will be auto-mocked instead of throwing,
   * whether they are requested with `container.get()` or injected into a
   * listed service.
   * Default: false (throws on unregistered dependencies)
   */
  allowUnregistered?: boolean

  /**
   * Logger for debugging.
   */
  logger?: Console | null
}

/**
 * UnitTestContainer for isolated unit testing.
 *
 * Only services explicitly listed in `providers` can be resolved. A token
 * outside the list fails with `ProviderNotFound`, whether it is asked for with
 * `container.get()` or with `inject()` / `asyncInject()` inside a listed
 * service; `optional()` returns `null` for it.
 *
 * With `allowUnregistered: true` every such request, `optional()` included,
 * receives an auto-mock instead: one placeholder object per token that throws
 * an explanatory error as soon as a property of it is read.
 *
 * Method calls are recorded by a proxy around what `get()` and `getSync()` of
 * the container and of its scopes return. Calls made on the instance a service
 * received through `inject()`, and calls a service makes to its own methods, do
 * not pass through that proxy and are not recorded.
 *
 * @example
 * ```ts
 * const container = new UnitTestContainer({
 *   providers: [
 *     { token: UserService, useClass: MockUserService },
 *     { token: ConfigToken, useValue: { apiUrl: 'test' } },
 *   ],
 * })
 *
 * const service = await container.get(UserService)
 *
 * // All method calls are automatically tracked
 * await service.findUser('123')
 *
 * container.expectCalled(UserService, 'findUser')
 * container.expectCalledWith(UserService, 'findUser', ['123'])
 * ```
 */
export class UnitTestContainer<
  // With `[]` in it, the list is inferred as a tuple.
  Provided extends readonly unknown[] | [] = any[],
> extends TrackingContainer {
  private readonly registeredTokens = new Set<Token>()
  private readonly autoMockedTokens = new Set<Token>()
  private readonly autoMocks = new Map<Token, { mock: object; record: ProviderRecord }>()
  /** The tracking proxy of each instance handed out, so that it has one identity. */
  private readonly trackers = new WeakMap<object, object>()
  /** The instance behind each tracking proxy. */
  private readonly tracked = new WeakMap<object, object>()
  private allowUnregistered: boolean

  constructor(options: UnitTestContainerOptions<Provided>) {
    // Strict: a dependency that is not in the providers list does not resolve,
    // however deep it is requested.
    super({ strict: true, logger: options.logger })
    this.allowUnregistered = options.allowUnregistered ?? false

    // Register all providers
    for (const provider of options.providers as readonly ProviderConfig[]) {
      this.registerProvider(provider)
    }
    this.trackResolutions(this)
  }

  override createScope(metadata?: Record<string, any>): ScopedContainer {
    const scope = super.createScope(metadata)
    this.trackResolutions(scope)
    return scope
  }

  /** Accepts an instance, or the tracking proxy that stands for it. */
  override invalidate(service: unknown): Promise<void> {
    return super.invalidate(this.tracked.get(service as object) ?? service)
  }

  // Scopes are created by `Container`, so `get` and `getSync` are wrapped on
  // each container instead of being overridden as methods.
  private trackResolutions(container: Container | ScopedContainer): void {
    const baseGet = container.get as (this: unknown, token: any, args?: unknown) => Promise<any>
    const baseGetSync = container.getSync as (this: unknown, token: any, args?: unknown) => any

    container.get = ((token: any, args?: unknown) => {
      let realToken: Token
      let mock: object | undefined
      try {
        realToken = this.resolveToken(token)
        mock = this.mockIfUnregistered(container, realToken)
      } catch (error) {
        return Promise.reject(error)
      }
      if (mock !== undefined) {
        return Promise.resolve(mock)
      }
      return baseGet
        .call(container, token, args)
        .then((instance) => this.track(realToken, instance))
    }) as AsyncResolve

    container.getSync = ((token: any, args?: unknown) => {
      const realToken = this.resolveToken(token)
      const mock = this.mockIfUnregistered(container, realToken)
      if (mock !== undefined) {
        return mock
      }
      return this.track(realToken, baseGetSync.call(container, token, args))
    }) as SyncResolve

    if (container !== this) {
      const baseInvalidate = container.invalidate.bind(container)
      container.invalidate = (service) =>
        baseInvalidate(this.tracked.get(service as object) ?? service)
    }
  }

  /**
   * Enables auto-mocking for unregistered dependencies, both for
   * `container.get()` and for injection inside a listed service.
   * Call this to switch from strict mode to auto-mock mode.
   */
  enableAutoMocking(): this {
    this.allowUnregistered = true
    return this
  }

  /**
   * Disables auto-mocking (strict mode).
   * Unregistered dependencies will throw. A service that was already built
   * keeps the auto-mocks it was given.
   */
  disableAutoMocking(): this {
    this.allowUnregistered = false
    return this
  }

  /**
   * Destroys every resolved instance and forgets the recorded calls and the
   * auto-mocks. The providers stay in place.
   */
  override async clear(): Promise<void> {
    await super.clear()
    this.autoMockedTokens.clear()
    this.autoMocks.clear()
  }

  /**
   * Whether the token is in the providers list or has an instance that was
   * added to the container. An auto-mocked token is not registered.
   */
  override isRegistered(token: AnyInjectableType): boolean {
    const base = baseToken(token)
    return base !== undefined && this.isProvided(this, base)
  }

  /** Whether `container` can resolve `token` without an auto-mock. */
  private isProvided(container: Container | ScopedContainer, token: Token): boolean {
    return (
      this.overrides.has(token) ||
      (container.isScope && container.store.hasToken(token)) ||
      (this.store.hasToken(token) && !this.autoMockedTokens.has(token))
    )
  }

  /**
   * Supplies the auto-mock to the resolution engine, so that `inject()`,
   * `optional()` and `asyncInject()` of an unlisted token inside a listed
   * service receive it too.
   * @internal
   */
  override providerForUnlisted(token: Token): ProviderRecord | undefined {
    if (!this.allowUnregistered || this.registeredTokens.has(token)) {
      return undefined
    }
    return this.autoMock(token).record
  }

  // ============================================================================
  // ASSERTION HELPERS
  // ============================================================================

  /**
   * Asserts that a service was auto-mocked (not in providers list).
   */
  expectAutoMocked(token: AnyToken): void {
    const realToken = this.resolveToken(token)

    if (!this.autoMockedTokens.has(realToken)) {
      throw new Error(
        `Expected ${realToken.toString()} to be auto-mocked, but it was not. ` +
          `Either it's in the providers list or hasn't been resolved.`,
      )
    }
  }

  /**
   * Asserts that a service was NOT auto-mocked (is in providers list).
   */
  expectNotAutoMocked(token: AnyToken): void {
    const realToken = this.resolveToken(token)

    if (this.autoMockedTokens.has(realToken)) {
      throw new Error(`Expected ${realToken.toString()} to NOT be auto-mocked, but it was.`)
    }
  }

  /**
   * Gets the tokens of all registered providers.
   */
  getRegisteredTokens(): ReadonlySet<InjectionToken<any, any>> {
    return this.registeredTokens
  }

  /**
   * Gets the tokens of all auto-mocked services.
   */
  getAutoMockedTokens(): ReadonlySet<InjectionToken<any, any>> {
    return this.autoMockedTokens
  }

  // ============================================================================
  // INTERNAL HELPERS
  // ============================================================================

  /** @internal */
  protected resolveToken(token: AnyToken): Token {
    if (typeof token === 'function') {
      return findInjectableToken(token) ?? newToken(token)
    }
    return baseToken(token)!
  }

  /**
   * For a token outside the providers list: returns its auto-mock, or throws
   * when auto-mocking is off. Returns `undefined` for a registered token.
   */
  private mockIfUnregistered(
    container: Container | ScopedContainer,
    token: Token,
  ): object | undefined {
    if (this.registeredTokens.has(token) || this.isProvided(container, token)) {
      return undefined
    }
    if (!this.allowUnregistered) {
      const name = token.toString()
      throw new DIError(
        DIErrorCode.ProviderNotFound,
        `[UnitTestContainer] ${name} is not in the providers list. ` +
          `Add it to providers, or set allowUnregistered: true to get an auto-mock for it.`,
        { name, path: [] },
      )
    }
    this.autoMockedTokens.add(token)
    return this.autoMock(token).mock
  }

  /**
   * The auto-mock of a token and the provider that serves it to the engine.
   * The token counts as auto-mocked once the mock is actually handed out.
   */
  private autoMock(token: Token): { mock: object; record: ProviderRecord } {
    let known = this.autoMocks.get(token)
    if (known === undefined) {
      const mock = createAutoMockProxy(token.toString())
      const record = provide(token, {
        factory: () => {
          this.autoMockedTokens.add(token)
          return mock
        },
        // One mock per token, also for a token that declares another scope.
        scope: InjectableScope.Singleton,
      }).record
      record.isMock = true
      known = { mock, record }
      this.autoMocks.set(token, known)
    }
    return known
  }

  /** Wraps an object instance in a proxy that records its method calls. */
  private track<T>(token: Token, instance: T): T {
    if (
      !instance ||
      typeof instance !== 'object' ||
      instance instanceof Container ||
      instance instanceof ScopedContainer
    ) {
      return instance
    }
    let proxy = this.trackers.get(instance)
    if (proxy === undefined) {
      proxy = createTrackingProxy(instance, token, this.methodCalls)
      this.trackers.set(instance, proxy)
      this.tracked.set(proxy, instance)
    }
    return proxy as T
  }

  private registerProvider(provider: ProviderConfig): void {
    const providerToken = provider.token as AnyToken
    const realToken = this.resolveToken(providerToken)

    this.registeredTokens.add(realToken)

    if (provider.useValue !== undefined) {
      this.registerValueBinding(providerToken, realToken, provider.useValue)
    } else if (provider.useClass) {
      this.overrides.set(realToken, provide(realToken, { class: provider.useClass }).record)
    } else if (provider.useFactory) {
      this.overrides.set(realToken, provide(realToken, { factory: provider.useFactory }).record)
    } else if (typeof providerToken === 'function') {
      // Just the class - register it as itself, with the scope it declares
      this.overrides.set(realToken, provide(realToken, providerToken).record)
    } else if (providerToken instanceof BoundInjectionToken) {
      // A bound token without an override resolves to the bound value
      this.registerValueBinding(providerToken, realToken, providerToken.value)
    }
  }

  private registerValueBinding(token: AnyToken, realToken: Token, value: unknown): void {
    const provider = provide(realToken, { value })
    this.overrides.set(realToken, provider.record)
    this.storeBoundValue(token, provider, value)
  }
}

/**
 * Gives a class that was never registered with `@Injectable` a token of its
 * own, without a default provider, so that it can be listed in `providers`
 * or named in an assertion. Only `UnitTestContainer` does this: everywhere
 * else, `Container.addInstance` included, such a class is rejected with
 * `ClassNotInjectable`.
 */
function newToken(target: new (...args: any[]) => any): Token {
  const token = new InjectionToken<any, any>(target)
  attachToken(target, token)
  return token
}
