import type { OnServiceDestroy } from '../../interfaces/index.mjs'
import type {
  HolderGetResult,
  IHolderStorage,
} from './holder-storage.interface.mjs'
import type { InstanceHolder } from './instance-holder.mjs'

import { InjectableScope, InjectableType } from '../../enums/index.mjs'
import { DIError } from '../../errors/index.mjs'
import { InstanceStatus } from './instance-holder.mjs'

/**
 * Unified storage implementation that works the same way regardless of scope.
 * Replaces RequestContext, HolderManager, SingletonStorage, RequestStorage.
 *
 * Scope is just metadata - storage operations are identical for all scopes.
 * Different storage instances are just isolated storage spaces.
 */
export class UnifiedStorage implements IHolderStorage {
  readonly scope: InjectableScope

  private readonly holders = new Map<string, InstanceHolder>()
  /**
   * Reverse dependency index: maps a dependency name to the set of holder names that depend on it.
   * This allows O(1) lookup of dependents instead of O(n) iteration.
   */
  private readonly dependents = new Map<string, Set<string>>()

  constructor(scope: InjectableScope = InjectableScope.Singleton) {
    this.scope = scope
  }

  get<T = unknown>(instanceName: string): HolderGetResult<T> {
    const holder = this.holders.get(instanceName)

    if (!holder) {
      return null
    }

    // Check holder status for error states
    switch (holder.status) {
      case InstanceStatus.Destroying:
        return [
          DIError.instanceDestroying(instanceName),
          holder as InstanceHolder<T>,
        ]

      case InstanceStatus.Error:
        return [
          holder.instance as unknown as DIError,
          holder as InstanceHolder<T>,
        ]

      case InstanceStatus.Creating:
      case InstanceStatus.Created:
        return [undefined, holder as InstanceHolder<T>]

      default:
        return null
    }
  }

  set(instanceName: string, holder: InstanceHolder): void {
    this.holders.set(instanceName, holder)
    // Register dependencies in reverse index
    if (holder.deps.size > 0) {
      this.registerDependencies(instanceName, holder.deps)
    }
  }

  delete(instanceName: string): boolean {
    const holder = this.holders.get(instanceName)
    if (holder) {
      // Remove this holder from the reverse index for all its dependencies
      this.removeFromDependentsIndex(instanceName, holder.deps)
    }
    return this.holders.delete(instanceName)
  }

  createHolder<T>(
    instanceName: string,
    type: InjectableType,
    deps: Set<string>,
  ): [
    ReturnType<typeof Promise.withResolvers<[undefined, T]>>,
    InstanceHolder<T>,
  ] {
    const deferred = Promise.withResolvers<[undefined, T]>()

    const holder: InstanceHolder<T> = {
      status: InstanceStatus.Creating,
      name: instanceName,
      instance: null,
      creationPromise: deferred.promise,
      destroyPromise: null,
      type,
      scope: this.scope,
      deps,
      destroyListeners: [],
      createdAt: Date.now(),
      waitingFor: new Set(),
    }

    return [deferred, holder]
  }

  storeInstance(instanceName: string, instance: unknown): void {
    const holder = this.holders.get(instanceName)
    if (holder) {
      throw DIError.storageError(
        'Instance already stored',
        'storeInstance',
        instanceName,
      )
    }
    this.set(instanceName, {
      status: InstanceStatus.Created,
      name: instanceName,
      instance,
      creationPromise: null,
      destroyPromise: null,
      type: InjectableType.Class,
      scope: this.scope,
      deps: new Set(),
      destroyListeners:
        typeof instance === 'object' &&
        instance !== null &&
        'onServiceDestroy' in instance
          ? [(instance as OnServiceDestroy).onServiceDestroy]
          : [],
      createdAt: Date.now(),
      waitingFor: new Set(),
    })
  }

  handles(scope: InjectableScope): boolean {
    return scope === this.scope
  }

  // ============================================================================
  // ITERATION AND QUERY
  // ============================================================================

  getAllNames(): string[] {
    return Array.from(this.holders.keys())
  }

  forEach(callback: (name: string, holder: InstanceHolder) => void): void {
    for (const [name, holder] of this.holders) {
      callback(name, holder)
    }
  }

  findByInstance(instance: unknown): InstanceHolder | null {
    for (const holder of this.holders.values()) {
      if (holder.instance === instance) {
        return holder
      }
    }
    return null
  }

  findDependents(instanceName: string): string[] {
    const dependents = this.dependents.get(instanceName)
    return dependents ? Array.from(dependents) : []
  }

  /**
   * Updates dependency references when instance names change.
   * Used during scope upgrades when instance names are regenerated with requestId.
   *
   * @param oldName The old instance name
   * @param newName The new instance name
   */
  updateDependencyReference(oldName: string, newName: string): void {
    // Update all holders that reference oldName in their deps Set
    for (const holder of this.holders.values()) {
      if (holder.deps.has(oldName)) {
        holder.deps.delete(oldName)
        holder.deps.add(newName)
      }
    }

    // Update reverse dependency index
    const oldDependents = this.dependents.get(oldName)
    if (oldDependents) {
      // Move dependents from old name to new name
      const newDependents = this.dependents.get(newName) || new Set<string>()
      for (const dependent of oldDependents) {
        newDependents.add(dependent)
      }
      this.dependents.set(newName, newDependents)
      this.dependents.delete(oldName)
    }

    // Update reverse index entries - if oldName was a dependency, update all holders that depend on it
    for (const [depName, dependents] of this.dependents.entries()) {
      if (depName === oldName) {
        // This shouldn't happen, but handle it just in case
        const newDependents = this.dependents.get(newName) || new Set<string>()
        for (const dependent of dependents) {
          newDependents.add(dependent)
        }
        this.dependents.set(newName, newDependents)
        this.dependents.delete(oldName)
      }
    }
  }

  // ============================================================================
  // INTERNAL HELPERS
  // ============================================================================

  /**
   * Registers a holder's dependencies in the reverse index.
   */
  private registerDependencies(holderName: string, deps: Set<string>): void {
    for (const dep of deps) {
      let dependents = this.dependents.get(dep)
      if (!dependents) {
        dependents = new Set()
        this.dependents.set(dep, dependents)
      }
      dependents.add(holderName)
    }
  }

  /**
   * Removes a holder from the reverse dependency index.
   */
  private removeFromDependentsIndex(
    holderName: string,
    deps: Set<string>,
  ): void {
    for (const dep of deps) {
      const dependents = this.dependents.get(dep)
      if (dependents) {
        dependents.delete(holderName)
        if (dependents.size === 0) {
          this.dependents.delete(dep)
        }
      }
    }
  }
}
