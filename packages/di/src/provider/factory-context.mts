import type { IContainer } from '../container/i-container.mjs'
import type { AnyInjectableType } from '../token/injection-token.mjs'

/**
 * Context handed to factory functions and `@Factory` classes.
 */
export interface FactoryContext {
  inject: <T = any>(token: AnyInjectableType, args?: unknown) => Promise<T>
  container: IContainer
  addDestroyListener: (listener: () => void | Promise<void>) => void
}
