import type { IContainer } from './interfaces/container.interface.mjs'
import type { Injectors } from './utils/index.mjs'

export interface FactoryContext {
  inject: Injectors['asyncInject']
  /**
   * The container instance for dependency resolution.
   * This may be either a Container or ScopedContainer.
   */
  container: IContainer
  addDestroyListener: (listener: () => void) => void
}
