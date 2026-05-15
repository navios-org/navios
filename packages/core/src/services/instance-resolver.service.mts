import { Container, DIError, DIErrorCode, Inject, Injectable } from '@navios/di'

import type { ClassType, ScopedContainer } from '@navios/di'

/**
 * Whether `error` is the "this class must be resolved per-request" signal,
 * meaning the eager root-`Container.get()` attempt failed for a scope reason
 * that the explicit, non-mutating {@link ScopedContainer.resolveInScope}
 * resolver correctly satisfies (it forces a Request host scope + request
 * storage for that one resolution).
 *
 * Two distinct `DIError` codes both mean "fall back to resolveInScope":
 * - `ScopeIncompatibleError`: a Singleton host eagerly depends on a
 *   Request/Transient service (raised by the scope-validator).
 * - `ScopeMismatchError`: the resolve target is *itself* declared
 *   Request-scoped (e.g. `@Controller({ scope: InjectableScope.Request })`)
 *   and was requested from the root `Container`, which rejects Request-scoped
 *   tokens *before* the scope-validator runs.
 *
 * Any OTHER error is a genuine construction failure and must be rethrown
 * (the v1 blanket `catch {}` masked these).
 */
function isScopeFallbackError(error: unknown): boolean {
  return (
    error instanceof DIError &&
    (error.code === DIErrorCode.ScopeIncompatibleError ||
      error.code === DIErrorCode.ScopeMismatchError)
  )
}

/**
 * Result of instance resolution attempt.
 * Contains either a cached singleton instance or a resolver function
 * that can be used to get a fresh instance per request.
 */
export interface InstanceResolution<T = any> {
  /**
   * Whether the instance was successfully cached as a singleton.
   * If true, `instance` contains the cached instance.
   * If false, the class has request-scoped dependencies and
   * must be resolved per-request using `resolve()`.
   */
  cached: boolean

  /**
   * The cached instance (only available if `cached` is true).
   */
  instance: T | null

  /**
   * Resolves the instance from a scoped container.
   * Use this when `cached` is false to get a fresh instance per request.
   */
  resolve: (scoped: ScopedContainer) => Promise<T>
}

/**
 * Result of resolving multiple instances.
 * Contains either all cached singleton instances or a resolver function.
 */
export interface MultiInstanceResolution<T = any> {
  /**
   * Whether ALL instances were successfully cached as singletons.
   * If true, `instances` contains all cached instances.
   * If false, at least one class has request-scoped dependencies.
   */
  cached: boolean

  /**
   * The cached instances (only available if `cached` is true).
   * Order matches the input array order.
   */
  instances: T[] | null

  /**
   * The original class types for dynamic resolution.
   */
  classTypes: ClassType[]

  /**
   * Resolves all instances from a scoped container.
   * Use this when `cached` is false to get fresh instances per request.
   */
  resolve: (scoped: ScopedContainer) => Promise<T[]>
}

/**
 * Service responsible for resolving class instances with scope detection.
 *
 * This service attempts to resolve classes as singletons from the root
 * container. If that fails for a scope reason — either the class eagerly
 * depends on a Request/Transient-scoped service (`@navios/di` v2 is fail-fast
 * and throws `DIError` with `code === DIErrorCode.ScopeIncompatibleError`), or
 * the class is *itself* declared Request-scoped and was requested from the
 * root container (`code === DIErrorCode.ScopeMismatchError`, e.g.
 * `@Controller({ scope: InjectableScope.Request })`) — the class is flagged as
 * not-cached and a resolver is returned that resolves the class per-request
 * via the explicit, non-mutating {@link ScopedContainer.resolveInScope}
 * opt-in API. See {@link isScopeFallbackError}.
 *
 * This replaces the v1 implicit Singleton -> Request scope-upgrade, which
 * mutated a shared global registration at runtime (and had a concurrency race
 * when two requests upgraded the same token at once). The registry is now
 * immutable w.r.t. scope; `resolveInScope` resolves the class in a forced
 * Request scope for that one resolution only, isolated per request.
 *
 * Any OTHER error (a genuine construction failure) is rethrown rather than
 * swallowed, so real failures surface instead of being silently masked.
 *
 * This enables optimal performance:
 * - Classes without request-scoped deps stay as singletons (faster)
 * - Classes with request-scoped deps are resolved per-request on demand
 *
 * @example
 * ```ts
 * const resolution = await instanceResolver.resolve(UserController)
 *
 * if (resolution.cached) {
 *   // Use cached singleton
 *   return resolution.instance.handleRequest(req)
 * } else {
 *   // Resolve per request
 *   const controller = await resolution.resolve(scopedContainer)
 *   return controller.handleRequest(req)
 * }
 * ```
 */
@Injectable()
export class InstanceResolverService {
  @Inject(Container) private accessor container!: Container

  /**
   * Attempts to resolve a class instance, detecting if it needs request scope
   * based on its dependencies.
   *
   * @param classType - The class to resolve
   * @returns A resolution result containing either a cached instance or resolver function
   */
  async resolve<T>(classType: ClassType): Promise<InstanceResolution<T>> {
    let cachedInstance: T | null = null

    try {
      cachedInstance = await this.container.get(classType)
    } catch (error) {
      // A scope-fallback error means "this class must be resolved
      // per-request". Anything else is a genuine construction failure that
      // the v1 blanket `catch {}` masked — rethrow it so it surfaces.
      if (!isScopeFallbackError(error)) {
        throw error
      }
    }

    return {
      cached: cachedInstance !== null,
      instance: cachedInstance,
      resolve: (scoped: ScopedContainer) => scoped.resolveInScope(classType) as Promise<T>,
    }
  }

  /**
   * Attempts to resolve multiple class instances, detecting if any need
   * request scope based on their dependencies.
   *
   * Returns `cached: true` only if ALL classes can be resolved as singletons.
   * If any class has request-scoped dependencies, returns `cached: false`.
   *
   * @param classTypes - The classes to resolve
   * @returns A resolution result containing either all cached instances or resolver function
   */
  async resolveMany<T>(classTypes: ClassType[]): Promise<MultiInstanceResolution<T>> {
    if (classTypes.length === 0) {
      return {
        cached: true,
        instances: [],
        classTypes: [],
        resolve: async () => [],
      }
    }

    // Resolve all classes in parallel
    const results = await Promise.all(
      classTypes.map(async (classType) => {
        try {
          const instance = await this.container.get(classType)
          return { success: true, instance: instance as T }
        } catch (error) {
          // See `resolve()`: a scope-fallback error is "needs per-request";
          // any other error is a genuine failure — rethrow.
          if (!isScopeFallbackError(error)) {
            throw error
          }
          return { success: false, instance: null }
        }
      }),
    )

    const allCached = results.every((r) => r.success)
    const cachedInstances = allCached ? results.map((r) => r.instance as T) : null

    return {
      cached: allCached,
      instances: cachedInstances,
      classTypes,
      resolve: (scoped: ScopedContainer) =>
        Promise.all(classTypes.map((classType) => scoped.resolveInScope(classType) as Promise<T>)),
    }
  }
}
