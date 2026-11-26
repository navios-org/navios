import type {
  BoundInjectionToken,
  ClassType,
  FactoryInjectionToken,
  InjectionToken,
} from '@navios/di'

/** Anything the service hooks accept as a token. */
export type AnyServiceToken =
  | ClassType
  | InjectionToken<any, any>
  | BoundInjectionToken<any, any>
  | FactoryInjectionToken<any, any>

export interface UseServiceResult<T> {
  /**
   * The instance once it is resolved, otherwise undefined.
   */
  data: T | undefined
  /**
   * What the container rejected with, normally a `DIError`.
   */
  error: Error | undefined
  /**
   * True while a resolution is in progress, including on the first render
   * when the container does not hold the instance yet.
   */
  isLoading: boolean
  /**
   * True when `data` is set.
   */
  isSuccess: boolean
  /**
   * True when `error` is set.
   */
  isError: boolean
  /**
   * Resolves the service again. Returns the existing instance when there is
   * one, so its use is retrying after an error.
   */
  refetch: () => void
}

export interface UseOptionalServiceResult<T> extends UseServiceResult<T> {
  /**
   * What the container rejected with, except a missing provider for the token
   * itself, which is reported by `isNotFound`.
   */
  error: Error | undefined
  /**
   * True when the token has no provider in the container.
   */
  isNotFound: boolean
}
