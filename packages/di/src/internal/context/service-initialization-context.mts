import type { InjectableScope } from '../../enums/index.mjs'
import type { IContainer } from '../../interfaces/container.interface.mjs'

/**
 * Async dependency resolver supplied on the initialization context.
 *
 * Matches the runtime assignment in
 * `InstanceResolver#createServiceInitializationContext`, which is
 * `async (token, args?) => container.get(token, args)` — an async
 * function taking a token plus optional args and resolving to the
 * dependency instance.
 */
type ContextInject = <T = unknown>(token: any, args?: any) => Promise<T>

/**
 * Context provided to injectors during service initialization.
 *
 * Extends FactoryContext with additional tracking information about
 * the service being initialized, its dependencies, and scope.
 * Used for scope upgrade tracking and dependency management.
 */
export interface ServiceInitializationContext {
  inject: ContextInject
  /**
   * Records a dependency edge (name + scope-upgrade tracking) WITHOUT
   * resolving the instance.
   *
   * Used by the @InjectLazy deferred path: the dependency must be registered
   * before the host's dependency subscriptions are set up (so event-based
   * cascade invalidation still works through lazy edges), even though the
   * instance itself is resolved lazily on first await (or never).
   */
  registerDependency: (token: any, args?: any) => void
  /**
   * The container instance for dependency resolution.
   * This may be either a Container or ScopedContainer.
   */
  container: IContainer
  addDestroyListener: (listener: () => void) => void
  getDestroyListeners: () => (() => void)[]
  /**
   * The name of the service being initialized.
   */
  serviceName: string
  /**
   * Set of dependency names that this service depends on.
   * Automatically populated as dependencies are resolved.
   */
  dependencies: Set<string>
  /**
   * The scope of the service being initialized.
   */
  scope: InjectableScope
  /**
   * Track a dependency that was resolved.
   * Used for scope upgrade tracking - if a Singleton service
   * resolves a Request dependency, the scope can be upgraded.
   *
   * @param name The name of the dependency
   * @param scope The scope of the dependency
   */
  trackDependency(name: string, scope: InjectableScope): void
}
