import type {
  BoundInjectionToken,
  ClassType,
  FactoryInjectionToken,
  InferInput,
  InjectionToken,
  MissingArgsError,
  ResolvedInstance,
  StandardSchemaV1,
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

/** What each service hook returns for an instance of type `T`. */
export interface ServiceHookResults<T> {
  service: UseServiceResult<T>
  optional: UseOptionalServiceResult<T>
  suspense: T
}

/**
 * The overloads of a service hook: `ServiceHook<'service'>` is `useService`,
 * `ServiceHook<'optional'>` is `useOptionalService` and
 * `ServiceHook<'suspense'>` is `useSuspenseService`.
 */
export interface ServiceHook<K extends keyof ServiceHookResults<unknown>> {
  // #1 Simple class
  <T extends ClassType>(token: T): ServiceHookResults<ResolvedInstance<T>>[K]
  // #2 Token with required Schema
  <T, S extends StandardSchemaV1>(
    token: InjectionToken<T, S>,
    args: InferInput<S>,
  ): ServiceHookResults<T>[K]
  // #3 Token with optional Schema
  <T, S extends StandardSchemaV1, R extends boolean>(
    token: InjectionToken<T, S, R>,
  ): R extends false ? ServiceHookResults<T>[K] : MissingArgsError<S>
  // #4 Token with no Schema
  <T>(token: InjectionToken<T, unknown>): ServiceHookResults<T>[K]
  <T>(token: BoundInjectionToken<T, any>): ServiceHookResults<T>[K]
  <T>(token: FactoryInjectionToken<T, any>): ServiceHookResults<T>[K]
}
