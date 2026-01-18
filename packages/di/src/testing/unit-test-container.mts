import { Container } from '../container/container.mjs'
import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { DIError } from '../errors/index.mjs'
import { BoundInjectionToken, InjectionToken } from '../token/injection-token.mjs'
import { Registry } from '../token/registry.mjs'
import { getInjectableToken } from '../utils/get-injectable-token.mjs'
import { defaultInjectors } from '../utils/index.mjs'

import type {
  LifecycleRecord,
  MethodCallRecord,
  MockServiceStats,
  ProviderConfig,
  UnitTestContainerOptions,
} from './types.mjs'

type AnyToken =
  | InjectionToken<any, any>
  | BoundInjectionToken<any, any>
  | (new (...args: any[]) => any)

/**
 * Creates a tracking proxy that records method calls.
 */
function createTrackingProxy<T extends object>(
  target: T,
  tokenId: string,
  methodCalls: Map<string, MethodCallRecord[]>,
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
            `This service was not provided in the providers list. ` +
            `Add it to providers or use allowUnregistered: false to catch this earlier.`,
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
  private readonly testRegistry: Registry
  private readonly methodCalls = new Map<string, MethodCallRecord[]>()
  private readonly lifecycleEvents = new Map<string, LifecycleRecord[]>()
  private readonly instanceCounts = new Map<string, number>()
  private readonly registeredTokenIds = new Set<string>()
  private readonly autoMockedTokenIds = new Set<string>()
  private allowUnregistered: boolean

  constructor(options: UnitTestContainerOptions) {
    const testRegistry = new Registry()
    super(testRegistry, options.logger ?? null, defaultInjectors)
    this.testRegistry = testRegistry
    this.allowUnregistered = options.allowUnregistered ?? false

    // Register all providers
    for (const provider of options.providers) {
      this.registerProvider(provider)
    }
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
   * Override get to wrap instances in tracking proxies.
   */
  override async get(token: any, args?: unknown): Promise<any> {
    // Check if token is a BoundInjectionToken and if it's registered
    const isBoundToken = token instanceof BoundInjectionToken
    const tokenId = isBoundToken ? token.id : undefined
    const realToken = this.resolveToken(token)

    // Check if this is a registered provider (check both bound token ID and real token ID)
    const isRegistered =
      (tokenId && this.registeredTokenIds.has(tokenId)) || this.registeredTokenIds.has(realToken.id)

    if (!isRegistered) {
      if (!this.allowUnregistered) {
        throw DIError.factoryNotFound(
          `${realToken.toString()} is not in the providers list. ` +
            `Add it to providers or enable allowUnregistered.`,
        )
      }

      // Auto-mock unregistered dependency
      const idToCheck = tokenId || realToken.id
      if (!this.autoMockedTokenIds.has(idToCheck)) {
        this.autoMockedTokenIds.add(idToCheck)
      }

      return createAutoMockProxy(idToCheck)
    }

    const instance = await super.get(token, args)

    // Wrap in tracking proxy if it's an object
    const trackingId = tokenId || realToken.id
    if (instance && typeof instance === 'object') {
      return createTrackingProxy(instance, trackingId, this.methodCalls)
    }

    return instance
  }

  /**
   * Clears all state and disposes the container.
   */
  async clear(): Promise<void> {
    await this.dispose()
    this.methodCalls.clear()
    this.lifecycleEvents.clear()
    this.instanceCounts.clear()
    this.autoMockedTokenIds.clear()
  }

  // ============================================================================
  // ASSERTION HELPERS
  // ============================================================================

  /**
   * Asserts that a service has been resolved at least once.
   */
  expectResolved(token: AnyToken): void {
    const realToken = this.resolveToken(token)
    const storage = this.getStorage()
    const names = storage.getAllNames()
    const found = names.some((name) => name.includes(realToken.id))

    if (!found) {
      throw new Error(`Expected ${realToken.toString()} to be resolved, but it was not`)
    }
  }

  /**
   * Asserts that a service has NOT been resolved.
   */
  expectNotResolved(token: AnyToken): void {
    const realToken = this.resolveToken(token)
    const storage = this.getStorage()
    const names = storage.getAllNames()
    const found = names.some((name) => name.includes(realToken.id))

    if (found) {
      throw new Error(`Expected ${realToken.toString()} to NOT be resolved, but it was`)
    }
  }

  /**
   * Asserts that a service was auto-mocked (not in providers list).
   */
  expectAutoMocked(token: AnyToken): void {
    const realToken = this.resolveToken(token)

    if (!this.autoMockedTokenIds.has(realToken.id)) {
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

    if (this.autoMockedTokenIds.has(realToken.id)) {
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
    const events = this.lifecycleEvents.get(realToken.id) || []
    events.push({
      event,
      timestamp: Date.now(),
      instanceName,
    })
    this.lifecycleEvents.set(realToken.id, events)

    if (event === 'created') {
      const count = this.instanceCounts.get(realToken.id) || 0
      this.instanceCounts.set(realToken.id, count + 1)
    }
  }

  /**
   * Asserts that a service's onServiceInit was called.
   */
  expectInitialized(token: AnyToken): void {
    const realToken = this.resolveToken(token)
    const events = this.lifecycleEvents.get(realToken.id) || []
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
    const events = this.lifecycleEvents.get(realToken.id) || []
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
    const events = this.lifecycleEvents.get(realToken.id) || []
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
    const calls = this.methodCalls.get(realToken.id) || []
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
    const calls = this.methodCalls.get(realToken.id) || []
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
    const calls = this.methodCalls.get(realToken.id) || []
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
    const calls = this.methodCalls.get(realToken.id) || []
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
    return this.methodCalls.get(realToken.id) || []
  }

  /**
   * Gets statistics about a service.
   */
  getServiceStats(token: AnyToken): MockServiceStats {
    const realToken = this.resolveToken(token)
    return {
      instanceCount: this.instanceCounts.get(realToken.id) || 0,
      methodCalls: this.methodCalls.get(realToken.id) || [],
      lifecycleEvents: this.lifecycleEvents.get(realToken.id) || [],
    }
  }

  /**
   * Clears all recorded method calls.
   */
  clearMethodCalls(): void {
    this.methodCalls.clear()
  }

  /**
   * Gets list of all registered provider token IDs.
   */
  getRegisteredTokenIds(): ReadonlySet<string> {
    return this.registeredTokenIds
  }

  /**
   * Gets list of all auto-mocked token IDs.
   */
  getAutoMockedTokenIds(): ReadonlySet<string> {
    return this.autoMockedTokenIds
  }

  // ============================================================================
  // INTERNAL HELPERS
  // ============================================================================

  private resolveToken(token: AnyToken): InjectionToken<any, any> {
    if (typeof token === 'function') {
      try {
        return getInjectableToken(token)
      } catch {
        // Class doesn't have @Injectable, create a token for it
        return InjectionToken.create(token)
      }
    }
    if (token instanceof BoundInjectionToken) {
      return token.token
    }
    return token
  }

  private registerProvider<T>(provider: ProviderConfig<T>): void {
    const providerToken = provider.token as AnyToken
    const realToken = this.resolveToken(providerToken)

    // Track both the real token ID and the bound token ID if it's a bound token
    this.registeredTokenIds.add(realToken.id)
    if (providerToken instanceof BoundInjectionToken) {
      this.registeredTokenIds.add(providerToken.id)
    }

    if (provider.useValue !== undefined) {
      this.registerValueBinding(realToken, provider.useValue)
    } else if (provider.useClass) {
      this.registerClassBinding(realToken, provider.useClass)
    } else if (provider.useFactory) {
      this.registerFactoryBinding(realToken, provider.useFactory)
    } else {
      // Just the token - register as itself
      if (typeof provider.token === 'function') {
        this.testRegistry.set(
          realToken,
          InjectableScope.Singleton,
          provider.token,
          InjectableType.Class,
          1000, // Higher priority for test overrides
        )
      } else if (providerToken instanceof BoundInjectionToken) {
        // If it's a bound token without override, register the bound value
        this.registerValueBinding(realToken, providerToken.value)
      }
    }
  }

  private registerValueBinding<T>(token: InjectionToken<T, any>, value: T): void {
    const ValueHolder = class {
      create(): T {
        return value
      }
    }

    this.testRegistry.set(
      token,
      InjectableScope.Singleton,
      ValueHolder,
      InjectableType.Factory,
      1000, // Higher priority for test overrides
    )

    const nameResolver = this.getNameResolver()
    const instanceName = nameResolver.generateInstanceName(
      token,
      undefined,
      undefined,
      InjectableScope.Singleton,
    )
    this.getStorage().storeInstance(instanceName, value)
    this.recordLifecycleEvent(token, 'created', instanceName)
  }

  private registerClassBinding<T>(
    token: InjectionToken<T, any>,
    cls: new (...args: any[]) => T,
  ): void {
    this.testRegistry.set(
      token,
      InjectableScope.Singleton,
      cls,
      InjectableType.Class,
      1000, // Higher priority for test overrides
    )
  }

  private registerFactoryBinding<T>(
    token: InjectionToken<T, any>,
    factory: () => T | Promise<T>,
  ): void {
    const FactoryWrapper = class {
      static factory = factory
      async create(): Promise<T> {
        return await factory()
      }
    }

    this.testRegistry.set(
      token,
      InjectableScope.Singleton,
      FactoryWrapper,
      InjectableType.Factory,
      1000, // Higher priority for test overrides
    )
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
