import type { ServiceLocatorManager } from './service-locator-manager.mjs'
import type {
  HolderGetResult,
  IHolderStorage,
} from './interfaces/holder-storage.interface.mjs'
import type { ServiceLocatorInstanceHolder } from './service-locator-instance-holder.mjs'

import { InjectableScope, InjectableType } from './enums/index.mjs'
import { DIErrorCode } from './errors/index.mjs'

/**
 * Holder storage implementation for Singleton-scoped services.
 * Wraps a ServiceLocatorManager instance.
 */
export class SingletonHolderStorage implements IHolderStorage {
  readonly scope = InjectableScope.Singleton

  constructor(private readonly manager: ServiceLocatorManager) {}

  get<T = unknown>(instanceName: string): HolderGetResult<T> {
    const [error, holder] = this.manager.get(instanceName)

    if (!error) {
      return [undefined, holder as ServiceLocatorInstanceHolder<T>]
    }

    // Handle different error types
    switch (error.code) {
      case DIErrorCode.InstanceNotFound:
        return null

      case DIErrorCode.InstanceDestroying:
        return [error, holder as ServiceLocatorInstanceHolder<T> | undefined]

      default:
        return [error]
    }
  }

  set(instanceName: string, holder: ServiceLocatorInstanceHolder): void {
    this.manager.set(instanceName, holder)
  }

  delete(instanceName: string): boolean {
    return this.manager.delete(instanceName)
  }

  createHolder<T>(
    instanceName: string,
    type: InjectableType,
    deps: Set<string>,
  ): [
    ReturnType<typeof Promise.withResolvers<[undefined, T]>>,
    ServiceLocatorInstanceHolder<T>,
  ] {
    return this.manager.createCreatingHolder<T>(
      instanceName,
      type,
      this.scope,
      deps,
    )
  }

  handles(scope: InjectableScope): boolean {
    return scope === InjectableScope.Singleton
  }

  // ============================================================================
  // ITERATION AND QUERY
  // ============================================================================

  getAllNames(): string[] {
    return this.manager.getAllNames()
  }

  forEach(
    callback: (name: string, holder: ServiceLocatorInstanceHolder) => void,
  ): void {
    for (const [name, holder] of this.manager.filter(() => true)) {
      callback(name, holder)
    }
  }

  findByInstance(instance: unknown): ServiceLocatorInstanceHolder | null {
    for (const [, holder] of this.manager.filter(
      (h) => h.instance === instance,
    )) {
      return holder
    }
    return null
  }

  findDependents(instanceName: string): string[] {
    const dependents: string[] = []
    for (const [name, holder] of this.manager.filter(() => true)) {
      if (holder.deps.has(instanceName)) {
        dependents.push(name)
      }
    }
    return dependents
  }
}
