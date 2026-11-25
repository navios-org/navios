import { Container } from '../container/container.mjs'
import { DIError, DIErrorCode } from '../errors/di-error.mjs'
import { InjectableScope } from '../injectable-scope.mjs'
import { baseToken } from '../internal/normalize.mjs'
import { provide } from '../provider/provide.mjs'
import { findInjectableToken, InjectableTokenMeta } from '../token/injectable-token.mjs'
import { BoundInjectionToken, InjectionToken } from '../token/injection-token.mjs'

import type { AsyncResolve, SyncResolve } from '../injection/resolve-signatures.mjs'
import type { ProviderRecord } from '../provider/provider-record.mjs'
import type { AnyInjectableType } from '../token/injection-token.mjs'

import { createAutoMockProxy } from './auto-mock.mjs'
import { argsMatch, createTrackingProxy } from './call-tracking.mjs'

import type { LifecycleRecord, MethodCallRecord, MockServiceStats } from './call-tracking.mjs'

type Token = InjectionToken<any, any>

type AnyToken =
  | InjectionToken<any, any>
  | BoundInjectionToken<any, any>
  | (new (...args: any[]) => any)

/**
 * Provider configuration for UnitTestContainer.
 */
export interface ProviderConfig<T = any> {
  token: InjectionToken<T, any> | BoundInjectionToken<T, any> | (new (...args: any[]) => T)
  useValue?: T
  useClass?: new (...args: any[]) => T
  useFactory?: () => T | Promise<T>
}

/**
 * Options for UnitTestContainer.
 */
export interface UnitTestContainerOptions {
  /**
   * List of providers to register. Only these services can be resolved.
   */
  providers: ProviderConfig[]

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
 * outside the list fails with `FactoryNotFound`, whether it is asked for with
 * `container.get()` or with `inject()` / `asyncInject()` inside a listed
 * service; `optional()` returns `null` for it.
 *
 * With `allowUnregistered: true` every such request, `optional()` included,
 * receives an auto-mock instead: one placeholder object per token that throws
 * an explanatory error as soon as a property of it is read.
 *
 * Method calls are recorded by a proxy around what `get()` and `getSync()`
 * return. Calls made on the instance a service received through `inject()`
 * do not pass through that proxy and are not recorded.
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
export class UnitTestContainer extends Container {
  private readonly methodCalls = new Map<Token, MethodCallRecord[]>()
  private readonly lifecycleEvents = new Map<Token, LifecycleRecord[]>()
  private readonly instanceCounts = new Map<Token, number>()
  private readonly registeredTokens = new Set<Token>()
  private readonly autoMockedTokens = new Set<Token>()
  private readonly autoMocks = new Map<Token, { mock: object; record: ProviderRecord }>()
  /** The tracking proxy of each instance handed out, so that it has one identity. */
  private readonly trackers = new WeakMap<object, object>()
  private allowUnregistered: boolean

  constructor(options: UnitTestContainerOptions) {
    // Strict: a dependency that is not in the providers list does not resolve,
    // however deep it is requested.
    super({ strict: true, logger: options.logger ?? null })
    this.allowUnregistered = options.allowUnregistered ?? false

    // Register all providers
    for (const provider of options.providers) {
      this.registerProvider(provider)
    }

    // `get` and `getSync` are instance properties of Container, so they are
    // wrapped here instead of being overridden as methods.
    const baseGet = this.get as (token: any, args?: unknown) => Promise<any>
    const baseGetSync = this.getSync as (token: any, args?: unknown) => any

    this.get = ((token: any, args?: unknown) => {
      let realToken: Token
      let mock: object | undefined
      try {
        realToken = this.resolveToken(token)
        mock = this.mockIfUnregistered(realToken)
      } catch (error) {
        return Promise.reject(error)
      }
      if (mock !== undefined) {
        return Promise.resolve(mock)
      }
      return baseGet(token, args).then((instance) => this.track(realToken, instance))
    }) as AsyncResolve

    this.getSync = ((token: any, args?: unknown) => {
      const realToken = this.resolveToken(token)
      const mock = this.mockIfUnregistered(realToken)
      if (mock !== undefined) {
        return mock
      }
      return this.track(realToken, baseGetSync(token, args))
    }) as SyncResolve
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
   * Clears all state and disposes the container.
   */
  async clear(): Promise<void> {
    await this.dispose()
    this.methodCalls.clear()
    this.lifecycleEvents.clear()
    this.instanceCounts.clear()
    this.autoMockedTokens.clear()
    this.autoMocks.clear()
  }

  /**
   * Whether the token is in the providers list or has an instance that was
   * added to the container. An auto-mocked token is not registered.
   */
  override isRegistered(token: AnyInjectableType): boolean {
    const base = baseToken(token)
    if (base === undefined) {
      return false
    }
    return (
      this.overrides.has(base) || (this.store.hasToken(base) && !this.autoMockedTokens.has(base))
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
   * Asserts that a service has been resolved at least once.
   */
  expectResolved(token: AnyToken): void {
    const realToken = this.resolveToken(token)
    const found = this.store.hasToken(realToken)

    if (!found) {
      throw new Error(`Expected ${realToken.toString()} to be resolved, but it was not`)
    }
  }

  /**
   * Asserts that a service has NOT been resolved.
   */
  expectNotResolved(token: AnyToken): void {
    const realToken = this.resolveToken(token)
    const found = this.store.hasToken(realToken)

    if (found) {
      throw new Error(`Expected ${realToken.toString()} to NOT be resolved, but it was`)
    }
  }

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

  // ============================================================================
  // LIFECYCLE ASSERTIONS
  // ============================================================================

  /**
   * Records a lifecycle event for tracking. It is the only source of what
   * `expectInitialized()`, `expectDestroyed()` and `expectNotDestroyed()`
   * see; call it from the hooks of your mocks. The container itself records
   * only `created`, and only for a `useValue` provider or a bound token.
   */
  recordLifecycleEvent(
    token: AnyToken,
    event: 'created' | 'initialized' | 'destroyed',
    instanceName: string,
  ): void {
    const realToken = this.resolveToken(token)
    const events = this.lifecycleEvents.get(realToken) || []
    events.push({
      event,
      timestamp: Date.now(),
      instanceName,
    })
    this.lifecycleEvents.set(realToken, events)

    if (event === 'created') {
      const count = this.instanceCounts.get(realToken) || 0
      this.instanceCounts.set(realToken, count + 1)
    }
  }

  /**
   * Asserts that an `initialized` event was recorded for the token with
   * `recordLifecycleEvent()`. The container does not observe `onServiceInit()`
   * of real instances: without a recorded event this fails even for a service
   * that was initialised.
   */
  expectInitialized(token: AnyToken): void {
    const realToken = this.resolveToken(token)
    const events = this.lifecycleEvents.get(realToken) || []
    const initialized = events.some((e) => e.event === 'initialized')

    if (!initialized) {
      throw new Error(
        `Expected ${realToken.toString()} to be initialized, but onServiceInit was not called`,
      )
    }
  }

  /**
   * Asserts that a `destroyed` event was recorded for the token with
   * `recordLifecycleEvent()`. The container does not observe
   * `onServiceDestroy()` of real instances: without a recorded event this
   * fails even for a service that was destroyed.
   */
  expectDestroyed(token: AnyToken): void {
    const realToken = this.resolveToken(token)
    const events = this.lifecycleEvents.get(realToken) || []
    const destroyed = events.some((e) => e.event === 'destroyed')

    if (!destroyed) {
      throw new Error(
        `Expected ${realToken.toString()} to be destroyed, but onServiceDestroy was not called`,
      )
    }
  }

  /**
   * Asserts that no `destroyed` event was recorded for the token with
   * `recordLifecycleEvent()`. It passes for a service that was destroyed
   * without anything recording the event.
   */
  expectNotDestroyed(token: AnyToken): void {
    const realToken = this.resolveToken(token)
    const events = this.lifecycleEvents.get(realToken) || []
    const destroyed = events.some((e) => e.event === 'destroyed')

    if (destroyed) {
      throw new Error(
        `Expected ${realToken.toString()} to NOT be destroyed, but onServiceDestroy was called`,
      )
    }
  }

  // ============================================================================
  // CALL TRACKING (AUTO-TRACKED VIA PROXY)
  // ============================================================================

  /**
   * Asserts that a method was called through the proxy that `get()` or
   * `getSync()` returned for the token. A call made on the instance another
   * service received through `inject()` is not seen.
   */
  expectCalled(token: AnyToken, method: string): void {
    const realToken = this.resolveToken(token)
    const calls = this.methodCalls.get(realToken) || []
    const found = calls.some((c) => c.method === method)

    if (!found) {
      throw new Error(`Expected ${realToken.toString()}.${method}() to be called, but it was not`)
    }
  }

  /**
   * Asserts that a method was NOT called through the proxy that `get()` or
   * `getSync()` returned for the token. It passes for a call made on the
   * instance another service received through `inject()`.
   */
  expectNotCalled(token: AnyToken, method: string): void {
    const realToken = this.resolveToken(token)
    const calls = this.methodCalls.get(realToken) || []
    const found = calls.some((c) => c.method === method)

    if (found) {
      throw new Error(`Expected ${realToken.toString()}.${method}() to NOT be called, but it was`)
    }
  }

  /**
   * Asserts that a method was called with specific arguments through the
   * proxy that `get()` or `getSync()` returned for the token.
   */
  expectCalledWith(token: AnyToken, method: string, expectedArgs: unknown[]): void {
    const realToken = this.resolveToken(token)
    const calls = this.methodCalls.get(realToken) || []
    const found = calls.some((c) => c.method === method && argsMatch(c.args, expectedArgs))

    if (!found) {
      const methodCalls = calls.filter((c) => c.method === method)
      const actualArgs = methodCalls.map((c) => JSON.stringify(c.args)).join(', ')
      throw new Error(
        `Expected ${realToken.toString()}.${method}() to be called with ${JSON.stringify(expectedArgs)}. ` +
          `Actual calls: [${actualArgs}]`,
      )
    }
  }

  /**
   * Asserts how many times a method was called through the proxy that `get()`
   * or `getSync()` returned for the token.
   */
  expectCallCount(token: AnyToken, method: string, count: number): void {
    const realToken = this.resolveToken(token)
    const calls = this.methodCalls.get(realToken) || []
    const actualCount = calls.filter((c) => c.method === method).length

    if (actualCount !== count) {
      throw new Error(
        `Expected ${realToken.toString()}.${method}() to be called ${count} times, but was called ${actualCount} times`,
      )
    }
  }

  /**
   * Gets the method calls recorded by the proxies that `get()` and
   * `getSync()` returned for the token.
   */
  getMethodCalls(token: AnyToken): MethodCallRecord[] {
    const realToken = this.resolveToken(token)
    return this.methodCalls.get(realToken) || []
  }

  /**
   * Gets statistics about a service.
   */
  getServiceStats(token: AnyToken): MockServiceStats {
    const realToken = this.resolveToken(token)
    return {
      instanceCount: this.instanceCounts.get(realToken) || 0,
      methodCalls: this.methodCalls.get(realToken) || [],
      lifecycleEvents: this.lifecycleEvents.get(realToken) || [],
    }
  }

  /**
   * Clears all recorded method calls.
   */
  clearMethodCalls(): void {
    this.methodCalls.clear()
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

  private resolveToken(token: AnyToken): Token {
    if (typeof token === 'function') {
      return findInjectableToken(token) ?? attachToken(token)
    }
    if (token instanceof InjectionToken) {
      return token
    }
    return token.token
  }

  /**
   * For a token outside the providers list: returns its auto-mock, or throws
   * when auto-mocking is off. Returns `undefined` for a registered token.
   */
  private mockIfUnregistered(token: Token): object | undefined {
    if (this.registeredTokens.has(token)) {
      return undefined
    }
    if (!this.allowUnregistered) {
      const name = token.toString()
      throw new DIError(
        DIErrorCode.FactoryNotFound,
        `[UnitTestContainer] ${name} is not in the providers list. ` +
          `Add it to providers, or set allowUnregistered: true to get an auto-mock for it.`,
        { name },
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
      known = { mock, record }
      this.autoMocks.set(token, known)
    }
    return known
  }

  /** Wraps an object instance in a proxy that records its method calls. */
  private track<T>(token: Token, instance: T): T {
    if (instance && typeof instance === 'object') {
      let proxy = this.trackers.get(instance)
      if (proxy === undefined) {
        proxy = createTrackingProxy(instance, token, this.methodCalls)
        this.trackers.set(instance, proxy)
      }
      return proxy as T
    }
    return instance
  }

  private registerProvider<T>(provider: ProviderConfig<T>): void {
    const providerToken = provider.token as AnyToken
    const realToken = this.resolveToken(providerToken)

    this.registeredTokens.add(realToken)

    if (provider.useValue !== undefined) {
      this.registerValueBinding(providerToken, realToken, provider.useValue)
    } else if (provider.useClass) {
      this.overrides.set(realToken, provide(realToken, { class: provider.useClass }).record)
    } else if (provider.useFactory) {
      const factory = provider.useFactory
      this.overrides.set(realToken, provide(realToken, { factory: () => factory() }).record)
    } else if (typeof providerToken === 'function') {
      // Just the class - register it as itself, with the scope it declares
      this.overrides.set(realToken, provide(realToken, providerToken).record)
    } else if (providerToken instanceof BoundInjectionToken) {
      // A bound token without an override resolves to the bound value
      this.registerValueBinding(providerToken, realToken, providerToken.value)
    }
  }

  private registerValueBinding(token: AnyToken, realToken: Token, value: unknown): void {
    this.overrides.set(realToken, provide(realToken, { value }).record)

    // Store the value right away, so that it counts as resolved before the
    // first `get`. A token that needs args has no single address to store the
    // value under; it is served by the provider on resolution instead.
    if (token instanceof BoundInjectionToken) {
      this.addInstance(token, value)
    } else if (realToken.schema === undefined) {
      this.addInstance(realToken, value)
    }
    this.recordLifecycleEvent(realToken, 'created', realToken.toString())
  }
}

/**
 * Gives a class that was never registered with `@Injectable` a token of its
 * own, without a default provider, so that it can be listed in `providers`
 * or named in an assertion. Only `UnitTestContainer` does this: everywhere
 * else, `Container.addInstance` included, such a class is rejected with
 * `ClassNotInjectable`.
 */
function attachToken(target: new (...args: any[]) => any): Token {
  const token = new InjectionToken<any, any>(target)
  Object.defineProperty(target, InjectableTokenMeta, {
    value: token,
    configurable: true,
    enumerable: false,
    writable: true,
  })
  return token
}
