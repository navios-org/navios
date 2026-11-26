import { InjectableScope } from '../injectable-scope.mjs'
import { discard } from '../internal/destruction.mjs'
import { isSelfEntry } from '../internal/entry.mjs'
import { dependentsOf } from '../internal/links.mjs'
import { aliasTarget, baseToken } from '../internal/lookup.mjs'
import { provide } from '../provider/provide.mjs'
import { getInjectableToken } from '../token/injectable-token.mjs'

import type { Entry } from '../internal/entry.mjs'
import type { ProvidedFor } from '../provider/factorable.mjs'
import type { FactoryContext } from '../provider/factory-context.mjs'
import type { Provider } from '../provider/provide.mjs'
import type { ClassTypeWithInstance } from '../token/class-type.mjs'
import type { PublicPart } from '../token/public-part.mjs'

import { buildDependencyGraph, buildSimplifiedDependencyGraph } from './dependency-graph.mjs'
import { TrackingContainer } from './tracking-container.mjs'

import type { DependencyGraph } from './dependency-graph.mjs'
import type { AnyToken, Token } from './tracking-container.mjs'

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
export class TestContainer extends TrackingContainer {
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
        this.storeBoundValue(token, provider, value)
      },
      toClass: (cls) => {
        this.setBinding(provide(realToken, { class: cls }))
      },
      toFactory: (factory) => {
        this.setBinding(provide(realToken, { factory }))
      },
    }
  }

  // ============================================================================
  // ASSERTION HELPERS
  // ============================================================================

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
  // CALL TRACKING
  // ============================================================================

  /**
   * Records a method call for tracking.
   * Call this from your mock implementations: it is the only source of what
   * `expectCalled()`, `expectNotCalled()`, `expectCalledWith()`,
   * `expectCallCount()` and `getMethodCalls()` see. Calls on real instances
   * are not observed.
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

  /** @internal */
  protected resolveToken(token: AnyToken): Token {
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
    return this.store.entries().filter((entry) => !isSelfEntry(entry))
  }
}
