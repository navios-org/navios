import type { BindingBuilder, DependencyGraph, DependencyNode, LifecycleRecord, MethodCallRecord, MockServiceStats, TestContainerOptions } from './types.mjs'

import { Container } from '../container/container.mjs'
import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { InstanceStatus } from '../internal/holder/instance-holder.mjs'
import { InjectionToken } from '../token/injection-token.mjs'
import { globalRegistry, Registry } from '../token/registry.mjs'
import { getInjectableToken } from '../utils/get-injectable-token.mjs'
import { defaultInjectors } from '../utils/index.mjs'

type AnyToken = InjectionToken<any, any> | (new (...args: any[]) => any)

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
  private readonly testRegistry: Registry
  private readonly methodCalls = new Map<string, MethodCallRecord[]>()
  private readonly lifecycleEvents = new Map<string, LifecycleRecord[]>()
  private readonly instanceCounts = new Map<string, number>()
  private readonly boundTokens = new Set<string>()

  /**
   * Creates a new TestContainer.
   *
   * @param options - Configuration options
   * @param options.parentRegistry - Parent registry. Defaults to globalRegistry.
   *   Pass `null` for a completely isolated container.
   * @param options.logger - Optional logger for debugging.
   *
   * @example
   * ```ts
   * // Uses globalRegistry as parent (default)
   * const container = new TestContainer()
   *
   * // Isolated container (no access to @Injectable classes)
   * const isolated = new TestContainer({ parentRegistry: null })
   *
   * // Custom parent registry
   * const custom = new TestContainer({ parentRegistry: myRegistry })
   * ```
   */
  constructor(options: TestContainerOptions = {}) {
    const { parentRegistry = globalRegistry, logger = null } = options
    const testRegistry = parentRegistry ? new Registry(parentRegistry) : new Registry()
    super(testRegistry, logger, defaultInjectors)
    this.testRegistry = testRegistry
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
   * ```
   */
  bind<T>(token: InjectionToken<T, any> | (new (...args: any[]) => T)): BindingBuilder<T> {
    const realToken = this.resolveToken(token)
    const tokenId = realToken.id

    return {
      toValue: (value: T) => {
        this.boundTokens.add(tokenId)
        this.registerValueBinding(realToken, value)
      },
      toClass: <C extends new (...args: any[]) => T>(cls: C) => {
        this.boundTokens.add(tokenId)
        this.registerClassBinding(realToken, cls)
      },
      toFactory: (factory: () => T | Promise<T>) => {
        this.boundTokens.add(tokenId)
        this.registerFactoryBinding(realToken, factory)
      },
    }
  }

  /**
   * Clears all bindings and resets container state.
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
   * Asserts that a service is registered as singleton scope.
   */
  expectSingleton(token: AnyToken): void {
    const realToken = this.resolveToken(token)
    const registry = this.getRegistry()

    if (!registry.has(realToken)) {
      throw new Error(`Expected ${realToken.toString()} to be registered, but it was not`)
    }

    const record = registry.get(realToken)
    if (record.scope !== InjectableScope.Singleton) {
      throw new Error(
        `Expected ${realToken.toString()} to be Singleton scope, but it was ${record.scope}`,
      )
    }
  }

  /**
   * Asserts that a service is registered as transient scope.
   */
  expectTransient(token: AnyToken): void {
    const realToken = this.resolveToken(token)
    const registry = this.getRegistry()

    if (!registry.has(realToken)) {
      throw new Error(`Expected ${realToken.toString()} to be registered, but it was not`)
    }

    const record = registry.get(realToken)
    if (record.scope !== InjectableScope.Transient) {
      throw new Error(
        `Expected ${realToken.toString()} to be Transient scope, but it was ${record.scope}`,
      )
    }
  }

  /**
   * Asserts that a service is registered as request scope.
   */
  expectRequestScoped(token: AnyToken): void {
    const realToken = this.resolveToken(token)
    const registry = this.getRegistry()

    if (!registry.has(realToken)) {
      throw new Error(`Expected ${realToken.toString()} to be registered, but it was not`)
    }

    const record = registry.get(realToken)
    if (record.scope !== InjectableScope.Request) {
      throw new Error(
        `Expected ${realToken.toString()} to be Request scope, but it was ${record.scope}`,
      )
    }
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
    const events = this.lifecycleEvents.get(realToken.id) || []
    const initialized = events.some((e) => e.event === 'initialized')

    if (!initialized) {
      throw new Error(`Expected ${realToken.toString()} to be initialized, but onServiceInit was not called`)
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
      throw new Error(`Expected ${realToken.toString()} to be destroyed, but onServiceDestroy was not called`)
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
      throw new Error(`Expected ${realToken.toString()} to NOT be destroyed, but onServiceDestroy was called`)
    }
  }

  // ============================================================================
  // CALL TRACKING
  // ============================================================================

  /**
   * Records a method call for tracking.
   * Call this from your mock implementations.
   */
  recordMethodCall(token: AnyToken, method: string, args: unknown[], result?: unknown, error?: Error): void {
    const realToken = this.resolveToken(token)
    const calls = this.methodCalls.get(realToken.id) || []
    calls.push({
      method,
      args,
      timestamp: Date.now(),
      result,
      error,
    })
    this.methodCalls.set(realToken.id, calls)
  }

  /**
   * Records a lifecycle event for tracking.
   */
  recordLifecycleEvent(token: AnyToken, event: 'created' | 'initialized' | 'destroyed', instanceName: string): void {
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
   * Asserts that a method was called with specific arguments.
   */
  expectCalledWith(token: AnyToken, method: string, expectedArgs: unknown[]): void {
    const realToken = this.resolveToken(token)
    const calls = this.methodCalls.get(realToken.id) || []
    const found = calls.some(
      (c) => c.method === method && this.argsMatch(c.args, expectedArgs),
    )

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
   * Gets statistics about a mocked service.
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

  // ============================================================================
  // DEPENDENCY GRAPH
  // ============================================================================

  /**
   * Gets the dependency graph for snapshot testing.
   * Returns a serializable structure that can be used with vitest snapshots.
   */
  getDependencyGraph(): DependencyGraph {
    const storage = this.getStorage()
    const nodes: Record<string, DependencyNode> = {}
    const rootTokens: string[] = []

    storage.forEach((name, holder) => {
      const tokenMatch = name.match(/^([^:]+)/)
      const tokenId = tokenMatch ? tokenMatch[1] : name

      nodes[name] = {
        token: tokenId,
        instanceName: name,
        scope: holder.scope,
        dependencies: Array.from(holder.deps),
        dependents: storage.findDependents(name),
      }

      // Root tokens have no dependents
      if (storage.findDependents(name).length === 0) {
        rootTokens.push(name)
      }
    })

    return { nodes, rootTokens }
  }

  /**
   * Gets a simplified dependency graph showing only token relationships.
   * Useful for cleaner snapshot comparisons.
   */
  getSimplifiedDependencyGraph(): Record<string, string[]> {
    const storage = this.getStorage()
    const graph: Record<string, string[]> = {}

    storage.forEach((name, holder) => {
      const tokenMatch = name.match(/^([^:]+)/)
      const tokenId = tokenMatch ? tokenMatch[1] : name

      if (!graph[tokenId]) {
        graph[tokenId] = []
      }

      for (const dep of holder.deps) {
        const depTokenMatch = dep.match(/^([^:]+)/)
        const depTokenId = depTokenMatch ? depTokenMatch[1] : dep
        if (!graph[tokenId].includes(depTokenId)) {
          graph[tokenId].push(depTokenId)
        }
      }
    })

    // Sort for consistent snapshots
    for (const key of Object.keys(graph)) {
      graph[key].sort()
    }

    return graph
  }

  // ============================================================================
  // INTERNAL HELPERS
  // ============================================================================

  private resolveToken(token: AnyToken): InjectionToken<any, any> {
    if (typeof token === 'function') {
      return getInjectableToken(token)
    }
    return token
  }

  private registerValueBinding<T>(token: InjectionToken<T, any>, value: T): void {
    // Create a simple class that returns the value
    const ValueHolder = class {
      static instance = value
    }

    this.testRegistry.set(token, InjectableScope.Singleton, ValueHolder, InjectableType.Class)

    // Store the instance directly
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

  private registerClassBinding<T>(token: InjectionToken<T, any>, cls: new (...args: any[]) => T): void {
    this.testRegistry.set(token, InjectableScope.Singleton, cls, InjectableType.Class)
  }

  private registerFactoryBinding<T>(token: InjectionToken<T, any>, factory: () => T | Promise<T>): void {
    // Create a factory class wrapper
    const FactoryWrapper = class {
      static factory = factory
      async create(): Promise<T> {
        return await factory()
      }
    }

    this.testRegistry.set(token, InjectableScope.Singleton, FactoryWrapper, InjectableType.Factory)
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
