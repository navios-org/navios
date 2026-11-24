import { Container } from '../container/container.mjs'
import { InjectableScope } from '../enums/index.mjs'
import { destroyEntry } from '../internal/engine.mjs'
import { InjectionToken } from '../token/injection-token.mjs'
import { findInjectableToken, provide } from '../token/provider.mjs'
import { getInjectableToken } from '../utils/get-injectable-token.mjs'

import type { Entry } from '../internal/entry.mjs'
import type { BoundInjectionToken } from '../token/injection-token.mjs'
import type { Provider } from '../token/provider.mjs'

import type {
  BindingBuilder,
  DependencyGraph,
  DependencyNode,
  LifecycleRecord,
  MethodCallRecord,
  MockServiceStats,
  TestContainerOptions,
} from './types.mjs'

type Token = InjectionToken<any, any>

type AnyToken =
  | InjectionToken<any, any>
  | BoundInjectionToken<any, any>
  | (new (...args: any[]) => any)

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
  private readonly boundTokens = new Set<Token>()

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
    super({ logger: options.logger ?? null })
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
  bind<T>(
    token: InjectionToken<T, any> | BoundInjectionToken<T, any> | (new (...args: any[]) => T),
  ): BindingBuilder<T> {
    const realToken = this.resolveToken(token)

    return {
      toValue: (value: T) => {
        this.setBinding(provide(realToken, { value }))
        this.storeBoundValue(token, realToken, value)
        this.recordLifecycleEvent(realToken, 'created', realToken.toString())
      },
      toClass: <C extends new (...args: any[]) => T>(cls: C) => {
        this.setBinding(provide(realToken, { class: cls }))
      },
      toFactory: (factory: () => T | Promise<T>) => {
        this.setBinding(provide(realToken, { factory: () => factory() }))
      },
    }
  }

  /**
   * Destroys every resolved instance and resets the recorded calls and
   * lifecycle events. Bindings made with `bind()` stay in place.
   */
  async clear(): Promise<void> {
    await this.dispose()
    this.methodCalls.clear()
    this.lifecycleEvents.clear()
    this.instanceCounts.clear()
    this.boundTokens.clear()
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
  // CALL TRACKING
  // ============================================================================

  /**
   * Records a method call for tracking.
   * Call this from your mock implementations.
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
   * Asserts that a method was called with specific arguments.
   */
  expectCalledWith(token: AnyToken, method: string, expectedArgs: unknown[]): void {
    const realToken = this.resolveToken(token)
    const calls = this.methodCalls.get(realToken) || []
    const found = calls.some((c) => c.method === method && this.argsMatch(c.args, expectedArgs))

    if (!found) {
      throw new Error(
        `Expected ${realToken.toString()}.${method}() to be called with ${JSON.stringify(expectedArgs)}, but it was not`,
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
    const entries = this.graphEntries()
    const included = new Set(entries)
    const namesOf = (linked: Iterable<Entry> | null): string[] => {
      const names = new Set<string>()
      if (linked !== null) {
        for (const entry of linked) {
          if (included.has(entry)) {
            names.add(nodeName(entry))
          }
        }
      }
      return Array.from(names)
    }

    const nodes: Record<string, DependencyNode> = {}
    const rootTokens: string[] = []

    for (const entry of entries) {
      const name = nodeName(entry)
      const dependents = namesOf(entry.dependents)
      nodes[name] = {
        token: entry.token.toString(),
        instanceName: name,
        scope: entry.record.scope,
        dependencies: namesOf(entry.deps),
        dependents,
      }

      // Root tokens have no dependents
      if (dependents.length === 0) {
        rootTokens.push(name)
      }
    }

    return { nodes, rootTokens }
  }

  /**
   * Gets a simplified dependency graph showing only token relationships.
   * Useful for cleaner snapshot comparisons.
   */
  getSimplifiedDependencyGraph(): Record<string, string[]> {
    const entries = this.graphEntries()
    const included = new Set(entries)
    const graph: Record<string, string[]> = {}

    for (const entry of entries) {
      const dependencies = (graph[entry.token.toString()] ??= [])
      if (entry.deps === null) {
        continue
      }
      for (const dependency of entry.deps) {
        const name = dependency.token.toString()
        if (included.has(dependency) && !dependencies.includes(name)) {
          dependencies.push(name)
        }
      }
    }

    // Sort for consistent snapshots
    for (const key of Object.keys(graph)) {
      graph[key].sort()
    }

    return graph
  }

  // ============================================================================
  // INTERNAL HELPERS
  // ============================================================================

  private resolveToken(token: AnyToken): Token {
    if (typeof token === 'function') {
      return getInjectableToken(token)
    }
    if (token instanceof InjectionToken) {
      return token
    }
    return token.token
  }

  /**
   * Makes `provider` the binding for its token. Unlike `Container.provide`,
   * a token that is already resolved may be rebound: its instances are
   * destroyed, together with everything that depends on them.
   */
  private setBinding(provider: Provider): void {
    for (const entry of this.store.entries()) {
      if (entry.token === provider.token) {
        void destroyEntry(entry)
        // An asynchronous destroy leaves the entry in place until it is done;
        // the next resolution must already see the new binding.
        this.store.delete(entry)
      }
    }
    this.boundTokens.add(provider.token)
    this.overrides.set(provider.token, provider.record)
  }

  /**
   * Stores a bound value right away, so that it counts as resolved before the
   * first `get`. A token that needs args has no single address to store the
   * value under; it is served by the binding on resolution instead.
   */
  private storeBoundValue(token: AnyToken, realToken: Token, value: unknown): void {
    if (typeof token !== 'function' && !(token instanceof InjectionToken)) {
      if ('value' in token) {
        this.addInstance(token, value)
      }
      return
    }
    if (realToken.schema === undefined) {
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

function nodeName(entry: Entry): string {
  const name = entry.token.toString()
  return entry.key === null ? name : `${name}:${entry.key}`
}
