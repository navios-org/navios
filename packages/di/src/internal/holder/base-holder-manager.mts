import type { InstanceHolder } from './instance-holder.mjs'

import { InjectableScope, InjectableType } from '../../enums/index.mjs'
import { DIError } from '../../errors/index.mjs'
import { CircularDetector } from '../lifecycle/circular-detector.mjs'
import { InstanceStatus } from './instance-holder.mjs'

/**
 * Result type for waitForHolderReady.
 * Returns either [undefined, holder] on success or [error] on failure.
 */
export type HolderReadyResult<T> = [undefined, InstanceHolder<T>] | [DIError]

/**
 * Abstract base class providing common functionality for managing InstanceHolder objects.
 *
 * Provides shared patterns for holder storage, creation, and lifecycle management
 * used by both singleton (HolderManager) and request-scoped (RequestContext) managers.
 */
export abstract class BaseHolderManager {
  protected readonly _holders: Map<string, InstanceHolder>
  /**
   * Reverse dependency index: maps a dependency name to the set of holder names that depend on it.
   * This allows O(1) lookup of dependents instead of O(n) iteration.
   */
  protected readonly _dependents: Map<string, Set<string>>

  constructor(protected readonly logger: Console | null = null) {
    this._holders = new Map()
    this._dependents = new Map()
  }

  /**
   * Protected getter for accessing the holders map from subclasses.
   */
  protected get holders(): Map<string, InstanceHolder> {
    return this._holders
  }

  /**
   * Abstract method to get a holder by name. Each implementation defines its own return type
   * based on their specific error handling and validation needs.
   */
  abstract get(name: string): any

  /**
   * Abstract method to set a holder by name. Each implementation may have different validation logic.
   */
  abstract set(name: string, holder: InstanceHolder): void

  /**
   * Abstract method to check if a holder exists. Each implementation may have different validation logic.
   */
  abstract has(name: string): any

  /**
   * Deletes a holder by name and cleans up the reverse dependency index.
   * @param name The name of the holder to delete
   * @returns true if the holder was deleted, false if it didn't exist
   */
  delete(name: string): boolean {
    const holder = this._holders.get(name)
    if (holder) {
      // Remove this holder from the reverse index for all its dependencies
      this.removeFromDependentsIndex(name, holder.deps)
    }
    return this._holders.delete(name)
  }

  /**
   * Registers a holder's dependencies in the reverse index.
   * Call this after creating a holder with dependencies.
   * @param holderName The name of the holder that has dependencies
   * @param deps The set of dependency names
   */
  registerDependencies(holderName: string, deps: Set<string>): void {
    for (const dep of deps) {
      let dependents = this._dependents.get(dep)
      if (!dependents) {
        dependents = new Set()
        this._dependents.set(dep, dependents)
      }
      dependents.add(holderName)
    }
  }

  /**
   * Removes a holder from the reverse dependency index.
   * @param holderName The name of the holder to remove
   * @param deps The set of dependency names to clean up
   */
  protected removeFromDependentsIndex(holderName: string, deps: Set<string>): void {
    for (const dep of deps) {
      const dependents = this._dependents.get(dep)
      if (dependents) {
        dependents.delete(holderName)
        if (dependents.size === 0) {
          this._dependents.delete(dep)
        }
      }
    }
  }

  /**
   * Gets all holder names that depend on the given instance name.
   * O(1) lookup using the reverse dependency index.
   * @param instanceName The instance name to find dependents for
   * @returns Array of holder names that depend on this instance
   */
  getDependents(instanceName: string): string[] {
    const dependents = this._dependents.get(instanceName)
    return dependents ? Array.from(dependents) : []
  }

  /**
   * Filters holders based on a predicate function.
   * @param predicate Function to test each holder
   * @returns A new Map containing only the holders that match the predicate
   * @deprecated Use forEachHolder() for iteration to avoid allocations
   */
  filter(
    predicate: (value: InstanceHolder<any>, key: string) => boolean,
  ): Map<string, InstanceHolder> {
    const result = new Map<string, InstanceHolder>()
    for (const [key, value] of this._holders) {
      if (predicate(value, key)) {
        result.set(key, value)
      }
    }
    return result
  }

  /**
   * Iterates over holders with a callback. More efficient than filter() as it
   * avoids creating intermediate arrays and Maps.
   * @param callback Function called for each holder with (holder, name)
   */
  forEachHolder(
    callback: (holder: InstanceHolder<any>, name: string) => void,
  ): void {
    for (const [name, holder] of this._holders) {
      callback(holder, name)
    }
  }

  /**
   * Finds the first holder matching a predicate. More efficient than filter()
   * when only one result is needed.
   * @param predicate Function to test each holder
   * @returns The first matching holder or undefined
   */
  findHolder(
    predicate: (holder: InstanceHolder<any>, name: string) => boolean,
  ): InstanceHolder | undefined {
    for (const [name, holder] of this._holders) {
      if (predicate(holder, name)) {
        return holder
      }
    }
    return undefined
  }

  /**
   * Clears all holders from this manager and the reverse dependency index.
   */
  clear(): void {
    this._holders.clear()
    this._dependents.clear()
  }

  /**
   * Gets the number of holders currently managed.
   */
  size(): number {
    return this._holders.size
  }

  /**
   * Creates a new holder with Creating status and a deferred creation promise.
   * This is useful for creating placeholder holders that can be fulfilled later.
   * @param name The name of the instance
   * @param type The injectable type
   * @param scope The injectable scope
   * @param deps Optional set of dependencies
   * @returns A tuple containing the deferred promise and the holder
   */
  createCreatingHolder<Instance>(
    name: string,
    type: InjectableType,
    scope: InjectableScope,
    deps: Set<string> = new Set(),
  ): [
    ReturnType<typeof Promise.withResolvers<[undefined, Instance]>>,
    InstanceHolder<Instance>,
  ] {
    const deferred = Promise.withResolvers<[undefined, Instance]>()

    const holder: InstanceHolder<Instance> = {
      status: InstanceStatus.Creating,
      name,
      instance: null,
      creationPromise: deferred.promise,
      destroyPromise: null,
      type,
      scope,
      deps,
      destroyListeners: [],
      createdAt: Date.now(),
      waitingFor: new Set(),
    }

    return [deferred, holder]
  }

  /**
   * Creates a new holder with Created status and an actual instance.
   * This is useful for creating holders that already have their instance ready.
   * @param name The name of the instance
   * @param instance The actual instance to store
   * @param type The injectable type
   * @param scope The injectable scope
   * @param deps Optional set of dependencies
   * @returns The created holder
   */
  protected createCreatedHolder<Instance>(
    name: string,
    instance: Instance,
    type: InjectableType,
    scope: InjectableScope,
    deps: Set<string> = new Set(),
  ): InstanceHolder<Instance> {
    const holder: InstanceHolder<Instance> = {
      status: InstanceStatus.Created,
      name,
      instance,
      creationPromise: null,
      destroyPromise: null,
      type,
      scope,
      deps,
      destroyListeners: [],
      createdAt: Date.now(),
      waitingFor: new Set(),
    }

    return holder
  }

  /**
   * Gets all holder names currently managed.
   */
  getAllNames(): string[] {
    return Array.from(this._holders.keys())
  }

  /**
   * Gets all holders currently managed.
   */
  getAllHolders(): InstanceHolder[] {
    return Array.from(this._holders.values())
  }

  /**
   * Checks if this manager has any holders.
   */
  isEmpty(): boolean {
    return this._holders.size === 0
  }

  /**
   * Waits for a holder to be ready and returns the appropriate result.
   * This is a shared utility used by both singleton and request-scoped resolution.
   *
   * @param holder The holder to wait for
   * @param waiterHolder Optional holder that is doing the waiting (for circular dependency detection)
   * @param getHolder Optional function to retrieve holders by name (required if waiterHolder is provided)
   * @returns A promise that resolves with [undefined, holder] on success or [DIError] on failure
   */
  static async waitForHolderReady<T>(
    holder: InstanceHolder<T>,
    waiterHolder?: InstanceHolder,
    getHolder?: (name: string) => InstanceHolder | undefined,
  ): Promise<HolderReadyResult<T>> {
    switch (holder.status) {
      case InstanceStatus.Creating: {
        // Check for circular dependency before waiting
        if (waiterHolder && getHolder) {
          const cycle = CircularDetector.detectCycle(
            waiterHolder.name,
            holder.name,
            getHolder,
          )
          if (cycle) {
            return [DIError.circularDependency(cycle)]
          }

          if (process.env.NODE_ENV !== 'production') {
            // Track the waiting relationship
            waiterHolder.waitingFor.add(holder.name)
          }
        }

        try {
          await holder.creationPromise
        } finally {
          if (process.env.NODE_ENV !== 'production') {
            // Clean up the waiting relationship
            if (waiterHolder) {
              waiterHolder.waitingFor.delete(holder.name)
            }
          }
        }

        return BaseHolderManager.waitForHolderReady(
          holder,
          waiterHolder,
          getHolder,
        )
      }

      case InstanceStatus.Destroying:
        return [DIError.instanceDestroying(holder.name)]

      case InstanceStatus.Error:
        return [holder.instance as unknown as DIError]

      case InstanceStatus.Created:
        return [undefined, holder]

      default:
        return [DIError.instanceNotFound('unknown')]
    }
  }
}
