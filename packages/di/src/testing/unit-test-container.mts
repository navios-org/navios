import { Container } from '../container/container.mjs'
import { DIError, DIErrorCode } from '../errors/index.mjs'
import { InjectableTokenMeta } from '../symbols/index.mjs'
import { BoundInjectionToken, InjectionToken } from '../token/injection-token.mjs'
import { findInjectableToken, provide } from '../token/provider.mjs'

import type { AsyncResolve, SyncResolve } from '../utils/types.mjs'

import type {
  LifecycleRecord,
  MethodCallRecord,
  MockServiceStats,
  ProviderConfig,
  UnitTestContainerOptions,
} from './types.mjs'

type Token = InjectionToken<any, any>

type AnyToken =
  | InjectionToken<any, any>
  | BoundInjectionToken<any, any>
  | (new (...args: any[]) => any)

/**
 * Creates a tracking proxy that records method calls.
 */
function createTrackingProxy<T extends object>(
  target: T,
  tokenId: Token,
  methodCalls: Map<Token, MethodCallRecord[]>,
): T {
  return new Proxy(target, {
    get(obj, prop) {
      const value = Reflect.get(obj, prop)

      if (typeof value === 'function' && typeof prop === 'string') {
        return function (this: unknown, ...args: unknown[]) {
          const calls = methodCalls.get(tokenId) || []
          const record: MethodCallRecord = {
            method: prop,
            args,
            timestamp: Date.now(),
          }

          try {
            const result = value.apply(this === undefined ? obj : this, args)

            if (result instanceof Promise) {
              return result
                .then((res) => {
                  record.result = res
                  calls.push(record)
                  methodCalls.set(tokenId, calls)
                  return res
                })
                .catch((err) => {
                  record.error = err
                  calls.push(record)
                  methodCalls.set(tokenId, calls)
                  throw err
                })
            }

            record.result = result
            calls.push(record)
            methodCalls.set(tokenId, calls)
            return result
          } catch (err) {
            record.error = err as Error
            calls.push(record)
            methodCalls.set(tokenId, calls)
            throw err
          }
        }
      }

      return value
    },
  })
}

/**
 * Creates an auto-mock proxy that throws on method access.
 */
function createAutoMockProxy(tokenId: string): object {
  return new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          return undefined
        }
        if (typeof prop === 'symbol') {
          return undefined
        }
        throw new Error(
          `[UnitTestContainer] Attempted to access '${prop}' on auto-mocked service '${tokenId}'. ` +
            `This service is not in the providers list. ` +
            `Add it to providers, or set allowUnregistered: false to fail as soon as it is requested.`,
        )
      },
    },
  )
}

/**
 * UnitTestContainer for isolated unit testing.
 *
 * Only services explicitly listed in `providers` can be resolved.
 * All method calls are automatically tracked via proxies.
 * Unregistered dependencies throw by default, or can be auto-mocked.
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
   * Enables auto-mocking for unregistered dependencies.
   * Call this to switch from strict mode to auto-mock mode.
   */
  enableAutoMocking(): this {
    this.allowUnregistered = true
    return this
  }

  /**
   * Disables auto-mocking (strict mode).
   * Unregistered dependencies will throw.
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
   * Records a lifecycle event for tracking.
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
   * Asserts that a service's onServiceInit was called.
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
   * Asserts that a service's onServiceDestroy was called.
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
   * Asserts that a service has NOT been destroyed.
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
   * Asserts that a method was called on a service.
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
   * Asserts that a method was NOT called on a service.
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
   * Asserts that a method was called with specific arguments.
   */
  expectCalledWith(token: AnyToken, method: string, expectedArgs: unknown[]): void {
    const realToken = this.resolveToken(token)
    const calls = this.methodCalls.get(realToken) || []
    const found = calls.some((c) => c.method === method && this.argsMatch(c.args, expectedArgs))

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
   * Asserts that a method was called a specific number of times.
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
   * Gets all recorded method calls for a service.
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
    return createAutoMockProxy(token.toString())
  }

  /** Wraps an object instance in a proxy that records its method calls. */
  private track<T>(token: Token, instance: T): T {
    if (instance && typeof instance === 'object') {
      return createTrackingProxy(instance, token, this.methodCalls)
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

  private argsMatch(actual: unknown[], expected: unknown[]): boolean {
    if (actual.length !== expected.length) {
      return false
    }
    return actual.every((arg, index) => {
      const exp = expected[index]
      if (typeof exp === 'object' && exp !== null) {
        return JSON.stringify(arg) === JSON.stringify(exp)
      }
      return arg === exp
    })
  }
}

/**
 * Gives a class that was never registered with `@Injectable` a token of its
 * own, without a default provider, so that it can be listed in `providers`.
 * Mirrors what `Container.addInstance` does for such a class.
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
