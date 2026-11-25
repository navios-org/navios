import type {
  AsyncResolve,
  OptionalResolve,
  SyncResolve,
} from '../injection/resolve-signatures.mjs'
import type { ProvidedFor } from '../provider/factorable.mjs'
import type { ClassType } from '../token/class-type.mjs'
import type {
  AnyInjectableType,
  BoundInjectionToken,
  InjectionToken,
} from '../token/injection-token.mjs'
import type { PublicPart } from '../token/public-part.mjs'

export interface IContainer {
  /** Resolves an instance, waiting for asynchronous initialisers. */
  get: AsyncResolve

  /**
   * Resolves an instance synchronously. Throws `AsyncInitRequired` when the
   * service or one of its dependencies has an unfinished async initialiser.
   */
  getSync: SyncResolve

  /** Returns an instance that is already built, or `null`. Never constructs. */
  peek: OptionalResolve

  invalidate(service: unknown): Promise<void>

  /**
   * Calls `listener` when the instance for `token` / `args` held by this
   * container is destroyed. Returns a function that removes the listener.
   */
  onInvalidate(token: AnyInjectableType, args: unknown, listener: () => void): () => void

  isRegistered(token: AnyInjectableType): boolean

  addInstance<K extends ClassType | InjectionToken<any, any> | BoundInjectionToken<any, any>>(
    token: K,
    instance: PublicPart<ProvidedFor<K>>,
  ): void

  dispose(): Promise<void>

  ready(): Promise<void>
}
