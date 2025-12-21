import type { ClassType, ScopedContainer } from '@navios/di'

import {
  Container,
  getInjectableToken,
  inject,
  Injectable,
  InjectableScope,
} from '@navios/di'

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
 * Service responsible for resolving class instances with automatic scope detection.
 *
 * This service attempts to resolve classes as singletons from the root container.
 * If resolution fails (because the class has request-scoped dependencies),
 * it automatically updates the class's scope to Request and provides a
 * resolver function for per-request instantiation.
 *
 * This enables optimal performance:
 * - Classes without request-scoped deps stay as singletons (faster)
 * - Classes with request-scoped deps are automatically promoted to request scope
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
  private container = inject(Container)

  /**
   * Attempts to resolve a class instance, automatically detecting if it needs
   * request scope based on its dependencies.
   *
   * @param classType - The class to resolve
   * @returns A resolution result containing either a cached instance or resolver function
   */
  async resolve<T>(classType: ClassType): Promise<InstanceResolution<T>> {
    let cachedInstance: T | null = null

    try {
      cachedInstance = await this.container.get(classType)
    } catch {
      // Class has request-scoped dependencies, update its scope to Request
      // so it will be resolved per-request from the scoped container
      const token = getInjectableToken(classType)
      this.container
        .getRegistry()
        .updateScope(token, InjectableScope.Request)
    }

    return {
      cached: cachedInstance !== null,
      instance: cachedInstance,
      resolve: (scoped: ScopedContainer) =>
        scoped.get(classType) as Promise<T>,
    }
  }

  /**
   * Attempts to resolve multiple class instances, automatically detecting if any need
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
        } catch {
          // Class has request-scoped dependencies, update its scope to Request
          const token = getInjectableToken(classType)
          this.container
            .getRegistry()
            .updateScope(token, InjectableScope.Request)
          return { success: false, instance: null }
        }
      }),
    )

    const allCached = results.every((r) => r.success)
    const cachedInstances = allCached
      ? results.map((r) => r.instance as T)
      : null

    return {
      cached: allCached,
      instances: cachedInstances,
      classTypes,
      resolve: (scoped: ScopedContainer) =>
        Promise.all(classTypes.map((classType) => scoped.get(classType) as Promise<T>)),
    }
  }
}

/**
 * @deprecated Use InstanceResolverService instead
 */
export const ControllerResolverService = InstanceResolverService

/**
 * @deprecated Use InstanceResolution instead
 */
export type ControllerResolution<T = any> = InstanceResolution<T>
