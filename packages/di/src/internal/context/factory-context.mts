import type { IContainer } from '../../interfaces/container.interface.mjs'

/**
 * Async dependency resolver supplied on the factory context.
 *
 * Matches the runtime assignment in `InstanceResolver`, which is
 * `async (token, args?) => container.get(token, args)` — an async
 * function taking a token plus optional args and resolving to the
 * dependency instance.
 */
type ContextInject = <T = unknown>(token: any, args?: any) => Promise<T>

/**
 * Context provided to factory functions during service instantiation.
 *
 * Provides access to dependency injection (via inject), the container,
 * and lifecycle hooks for cleanup.
 */
export interface FactoryContext {
  inject: ContextInject
  /**
   * The container instance for dependency resolution.
   * This may be either a Container or ScopedContainer.
   */
  container: IContainer
  addDestroyListener: (listener: () => void) => void
}
