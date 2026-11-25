import type { AnyInjectableType, Container } from '@navios/di'

/**
 * Dependencies shared by every request context of an application.
 * @internal
 */
export interface ContextHost {
  readonly container: Container
  /** Called the first time a request-scoped token is used; may throw. */
  onScopedUse: ((token: AnyInjectableType) => void) | null
}
