import { Container } from '../container/container.mjs'
import { InjectableScope } from '../injectable-scope.mjs'
import { discard } from '../internal/destruction.mjs'
import { dependentsOf } from '../internal/links.mjs'
import { aliasTarget, baseToken, isResolved } from '../internal/normalize.mjs'
import { provide } from '../provider/provide.mjs'
import { findInjectableToken, getInjectableToken } from '../token/injectable-token.mjs'
import { BoundInjectionToken } from '../token/injection-token.mjs'

import type { Entry } from '../internal/entry.mjs'
import type { ProvidedFor } from '../provider/factorable.mjs'
import type { FactoryContext } from '../provider/factory-context.mjs'
import type { Provider } from '../provider/provide.mjs'
import type { ClassTypeWithInstance } from '../token/class-type.mjs'
import type { InjectionToken } from '../token/injection-token.mjs'
import type { PublicPart } from '../token/public-part.mjs'

import { argsMatch, formatArgs } from './call-tracking.mjs'
import { buildDependencyGraph, buildSimplifiedDependencyGraph } from './dependency-graph.mjs'

import type { LifecycleRecord, MethodCallRecord, MockServiceStats } from './call-tracking.mjs'
import type { DependencyGraph } from './dependency-graph.mjs'

type Token = InjectionToken<any, any>

type AnyToken =
  | InjectionToken<any, any>
  | BoundInjectionToken<any, any>
  | (new (...args: any[]) => any)

/**
 * Binding configuration for TestContainer.
 */
export interface BindingBuilder<T> {
  /**
   * Bind to a concrete value.
   */
  toValue(value: PublicPart<T>): void

  /**
   * Bind to a class implementation.
   */
  toClass(cls: ClassTypeWithInstance<PublicPart<T>>): void

  /**
   * Bind to a factory function, called with the factory context and the
   * validated args.
   */
  toFactory(
    factory: (ctx: FactoryContext, args: any) => PublicPart<T> | Promise<PublicPart<T>>,
  ): void
}

/**
 * Options for TestContainer.
 */
export interface TestContainerOptions {
  /**
   * Logger for debugging.
   */
  logger?: Console | null
}

/**
 * TestContainer extends Container with testing utilities.
 *
 * Provides simple value/class binding for integration/e2e tests,
 * plus assertion helpers and dependency graph inspection.
 *
 * @example
 * ```ts
 * const container = new TestContainer()
 *
 * // Bind mock values
 * container.bind(DatabaseToken).toValue(mockDatabase)
 * container.bind(UserService).toClass(MockUserService)
 *
 * // Use container normally
 * const service = await container.get(MyService)
 *
 * // Assert on container state
 * container.expectResolved(MyService)
 * container.expectSingleton(MyService)
 * ```
 */
export class TestContainer extends Container {
  private readonly methodCalls = new Map<Token, MethodCallRecord[]>()
  private readonly lifecycleEvents = new Map<Token, LifecycleRecord[]>()
  private readonly instanceCounts = new Map<Token, number>()

  /**
   * Creates a new TestContainer.
   *
   * Classes registered with `@Injectable` resolve as usual; `bind()` replaces
   * what a token resolves to in this container only.
   *
   * @param options - Configuration options
   * @param options.logger - Optional logger for debugging.
   */
  constructor(options: TestContainerOptions = {}) {
    super({ logger: options.logger })
  }

  // ============================================================================
  // BINDING API
  // ============================================================================

  /**
   * Creates a binding builder for the given token.
   *
   * @example
   * ```ts
   * container.bind(UserService).toValue(mockUserService)
   * container.bind(DatabaseToken).toClass(MockDatabase)
   * container.bind(ConfigToken).toFactory(() => ({ apiKey: 'test' }))
   * container.bind(BOUND_CONFIG_TOKEN).toValue(overrideValue)
   * ```
   */
  bind<K extends AnyToken>(token: K): BindingBuilder<ProvidedFor<K>> {
    const realToken = this.resolveToken(token)

    return {
      toValue: (value) => {
        const provider = provide(realToken, { value })
        this.setBinding(provider)
        if (provider.record.scope === InjectableScope.Singleton) {
          this.storeBoundValue(token, realToken, value)
        }
        this.recordLifecycleEvent(realToken, 'created', realToken.toString())
      },
      toClass: (cls) => {
        this.setBinding(provide(realToken, { class: cls }))
      },
      toFactory: (factory) => {
        this.setBinding(provide(realToken, { factory }))
      },
    }
  }

  /**
   * Destroys every resolved instance and resets the recorded calls and
   * lifecycle events. Bindings made with `bind()` stay in place.
   */
  async clear(): Promise<void> {
    await this.reset()
    this.methodCalls.clear()
    this.lifecycleEvents.clear()
    this.instanceCounts.clear()
  }

  // ============================================================================
  // ASSERTION HELPERS
  // ============================================================================

  /**
   * Asserts that a service has been resolved at least once.
   */
  expectResolved(token: AnyToken): void {
    const realToken = this.resolveToken(token)
    const found = isResolved(this, realToken)

    if (!found) {
      throw new Error(`Expected ${realToken.toString()} to be resolved, but it was not`)
    }
  }

  /**
   * Asserts that a service has NOT been resolved.
   */
  expectNotResolved(token: AnyToken): void {
    const realToken = this.resolveToken(token)
    const found = isResolved(this, realToken)

    if (found) {
      throw new Error(`Expected ${realToken.toString()} to NOT be resolved, but it was`)
    }
  }

  /**
   * Asserts that a service is registered as singleton scope.
   */
  expectSingleton(token: AnyToken): void {
    const realToken = this.resolveToken(token)
    this.expectScope(realToken, InjectableScope.Singleton)
  }

  /**
   * Asserts that a service is registered as transient scope.
   */
  expectTransient(token: AnyToken): void {
    const realToken = this.resolveToken(token)
    this.expectScope(realToken, InjectableScope.Transient)
  }

  /**
   * Asserts that a service is registered as request scope.
   */
  expectRequestScoped(token: AnyToken): void {
    const realToken = this.resolveToken(token)
    this.expectScope(realToken, InjectableScope.Request)
  }

  /**
   * Asserts that two service resolutions return the same instance.
   */
  async expectSameInstance(token: AnyToken): Promise<void> {
    const instance1 = await this.get(token as any)
    const instance2 = await this.get(token as any)

    if (instance1 !== instance2) {
      const realToken = this.resolveToken(token)
      throw new Error(
        `Expected ${realToken.toString()} to return same instance, but got different instances`,
      )
    }
  }

  /**
   * Asserts that two service resolutions return different instances.
   */
  async expectDifferentInstances(token: AnyToken): Promise<void> {
    const instance1 = await this.get(token as any)
    const instance2 = await this.get(token as any)

    if (instance1 === instance2) {
      const realToken = this.resolveToken(token)
      throw new Error(
        `Expected ${realToken.toString()} to return different instances, but got same instance`,
      )
    }
  }

  // ============================================================================
  // LIFECYCLE ASSERTIONS
  // ============================================================================

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
  // CALL TRACKING
  // ============================================================================

  /**
   * Records a method call for tracking.
   * Call this from your mock implementations: it is the only source of what
   * `expectCalled()`, `expectCalledWith()`, `expectCallCount()` and
   * `getMethodCalls()` see. Calls on real instances are not observed.
   */
  recordMethodCall(
    token: AnyToken,
    method: string,
    args: unknown[],
    result?: unknown,
    error?: Error,
  ): void {
    const realToken = this.resolveToken(token)
    const calls = this.methodCalls.get(realToken) || []
    calls.push({
      method,
      args,
      timestamp: Date.now(),
      result,
      error,
    })
    this.methodCalls.set(realToken, calls)
  }

  /**
   * Records a lifecycle event for tracking. It is the only source of what
   * `expectInitialized()`, `expectDestroyed()` and `expectNotDestroyed()`
   * see; call it from the hooks of your mocks. The container itself records
   * only `created`, and only for a value bound with `bind().toValue()`.
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
   * Asserts that a call of the method was reported for the token with
   * `recordMethodCall()`. Calls on real instances are not observed.
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
   * Asserts that a call of the method with these arguments was reported for
   * the token with `recordMethodCall()`.
   */
  expectCalledWith(token: AnyToken, method: string, expectedArgs: unknown[]): void {
    const realToken = this.resolveToken(token)
    const calls = this.methodCalls.get(realToken) || []
    const found = calls.some((c) => c.method === method && argsMatch(c.args, expectedArgs))

    if (!found) {
      throw new Error(
        `Expected ${realToken.toString()}.${method}() to be called with ${formatArgs(expectedArgs)}, but it was not`,
      )
    }
  }

  /**
   * Asserts how many calls of the method were reported for the token with
   * `recordMethodCall()`.
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
   * Gets the method calls reported for a token with `recordMethodCall()`.
   */
  getMethodCalls(token: AnyToken): MethodCallRecord[] {
    const realToken = this.resolveToken(token)
    return this.methodCalls.get(realToken) || []
  }

  /**
   * Gets statistics about a mocked service.
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

  // ============================================================================
  // DEPENDENCY GRAPH
  // ============================================================================

  /**
   * Gets the dependency graph for snapshot testing.
   * Returns a serializable structure that can be used with vitest snapshots.
   */
  getDependencyGraph(): DependencyGraph {
    return buildDependencyGraph(this.graphEntries())
  }

  /**
   * Gets a simplified dependency graph showing only token relationships.
   * Useful for cleaner snapshot comparisons.
   */
  getSimplifiedDependencyGraph(): Record<string, string[]> {
    return buildSimplifiedDependencyGraph(this.graphEntries())
  }

  // ============================================================================
  // INTERNAL HELPERS
  // ============================================================================

  private resolveToken(token: AnyToken): Token {
    return typeof token === 'function' ? getInjectableToken(token) : baseToken(token)!
  }

  /**
   * Makes `provider` the binding for its token. Unlike `Container.provide`,
   * a token that is already resolved may be rebound: its instances are
   * destroyed, together with everything that depends on them. Instances that
   * an open scope holds stay as they are. What an alias points to stays as well,
   * and only its dependents are destroyed: some of them came by the alias.
   */
  private setBinding(provider: Provider): void {
    const target = aliasTarget(this, provider.token)
    for (const entry of this.store.entries()) {
      if (entry.token === provider.token) {
        discard(entry)
        // An asynchronous destroy leaves the entry in place until it is done;
        // the next resolution must already see the new binding.
        this.store.delete(entry)
      } else if (entry.token === target) {
        dependentsOf(entry).forEach(discard)
      }
    }
    this.overrides.set(provider.token, provider.record)
  }

  /**
   * Stores a bound value right away, so that it counts as resolved before the
   * first `get`. A token that needs args has no single address to store the
   * value under; it is served by the binding on resolution instead.
   */
  private storeBoundValue(token: AnyToken, realToken: Token, value: unknown): void {
    if (token instanceof BoundInjectionToken) {
      this.addInstance(token, value)
    } else if (realToken.schema === undefined) {
      this.addInstance(realToken, value)
    }
  }

  private expectScope(token: Token, scope: InjectableScope): void {
    const record = this.getProvider(token)
    if (record === undefined) {
      throw new Error(`Expected ${token.toString()} to be registered, but it was not`)
    }
    if (record.scope !== scope) {
      throw new Error(
        `Expected ${token.toString()} to be ${scope} scope, but it was ${record.scope}`,
      )
    }
  }

  /** Every entry of this container except the container itself. */
  private graphEntries(): Entry[] {
    const self = findInjectableToken(Container)
    return this.store.entries().filter((entry) => entry.token !== self)
  }
}
