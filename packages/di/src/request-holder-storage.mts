import type { BaseInstanceHolderManager } from './base-instance-holder-manager.mjs'
import type {
  HolderGetResult,
  IHolderStorage,
} from './interfaces/holder-storage.interface.mjs'
import type { RequestContextHolder } from './request-context-holder.mjs'
import type { ServiceLocatorInstanceHolder } from './service-locator-instance-holder.mjs'

import { InjectableScope, InjectableType } from './enums/index.mjs'
import { DIError } from './errors/index.mjs'
import { ServiceLocatorInstanceHolderStatus } from './service-locator-instance-holder.mjs'

/**
 * Holder storage implementation for Request-scoped services.
 * Wraps a RequestContextHolder instance from a ScopedContainer.
 */
export class RequestHolderStorage implements IHolderStorage {
  readonly scope = InjectableScope.Request

  constructor(
    private readonly contextHolder: RequestContextHolder,
    private readonly holderManager: BaseInstanceHolderManager,
  ) {}

  get<T = unknown>(instanceName: string): HolderGetResult<T> {
    const holder = this.contextHolder.get(instanceName)

    if (!holder) {
      return null
    }

    // Check holder status for error states
    switch (holder.status) {
      case ServiceLocatorInstanceHolderStatus.Destroying:
        return [
          DIError.instanceDestroying(instanceName),
          holder as ServiceLocatorInstanceHolder<T>,
        ]

      case ServiceLocatorInstanceHolderStatus.Error:
        return [holder.instance as DIError, holder as ServiceLocatorInstanceHolder<T>]

      case ServiceLocatorInstanceHolderStatus.Creating:
      case ServiceLocatorInstanceHolderStatus.Created:
        return [undefined, holder as ServiceLocatorInstanceHolder<T>]

      default:
        return null
    }
  }

  set(instanceName: string, holder: ServiceLocatorInstanceHolder): void {
    this.contextHolder.set(instanceName, holder)
  }

  delete(instanceName: string): boolean {
    return this.contextHolder.delete(instanceName)
  }

  createHolder<T>(
    instanceName: string,
    type: InjectableType,
    deps: Set<string>,
  ): [
    ReturnType<typeof Promise.withResolvers<[undefined, T]>>,
    ServiceLocatorInstanceHolder<T>,
  ] {
    // Use the holderManager's createCreatingHolder method
    // which is inherited from BaseInstanceHolderManager
    return this.holderManager.createCreatingHolder<T>(
      instanceName,
      type,
      this.scope,
      deps,
    )
  }

  handles(scope: InjectableScope): boolean {
    return scope === InjectableScope.Request
  }

  // ============================================================================
  // ITERATION AND QUERY
  // ============================================================================

  getAllNames(): string[] {
    const names: string[] = []
    for (const [name] of this.contextHolder.holders) {
      names.push(name)
    }
    return names
  }

  forEach(
    callback: (name: string, holder: ServiceLocatorInstanceHolder) => void,
  ): void {
    for (const [name, holder] of this.contextHolder.holders) {
      callback(name, holder)
    }
  }

  findByInstance(instance: unknown): ServiceLocatorInstanceHolder | null {
    for (const holder of this.contextHolder.holders.values()) {
      if (holder.instance === instance) {
        return holder
      }
    }
    return null
  }

  findDependents(instanceName: string): string[] {
    const dependents: string[] = []
    for (const [name, holder] of this.contextHolder.holders) {
      if (holder.deps.has(instanceName)) {
        dependents.push(name)
      }
    }
    return dependents
  }
}
