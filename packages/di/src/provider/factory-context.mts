import type { IContainer } from '../container/i-container.mjs'
import type { AsyncResolve } from '../injection/resolve-signatures.mjs'

/**
 * Context handed to factory functions and `@Factory` classes.
 */
export interface FactoryContext {
  /** Resolves a dependency. Can be called at any point, also after an await. */
  inject: AsyncResolve
  container: IContainer
  /**
   * Registers cleanup for the product. The listeners run when it is destroyed,
   * newest first, or when the factory fails.
   */
  addDestroyListener: (listener: () => void | Promise<void>) => void
}
