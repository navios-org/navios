import type { ServiceLocatorInstanceHolder } from './service-locator-instance-holder.mjs'

import { InjectableScope, InjectableType } from './enums/index.mjs'
import { ServiceLocatorInstanceHolderStatus } from './service-locator-instance-holder.mjs'

/**
 * Abstract base class that provides common functionality for managing ServiceLocatorInstanceHolder objects.
 * This class contains shared patterns used by both RequestContextHolder and ServiceLocatorManager.
 */
export abstract class BaseInstanceHolderManager {
  protected readonly _holders: Map<string, ServiceLocatorInstanceHolder>

  constructor(protected readonly logger: Console | null = null) {
    this._holders = new Map()
  }

  /**
   * Protected getter for accessing the holders map from subclasses.
   */
  protected get holders(): Map<string, ServiceLocatorInstanceHolder> {
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
  abstract set(name: string, holder: ServiceLocatorInstanceHolder): void

  /**
   * Abstract method to check if a holder exists. Each implementation may have different validation logic.
   */
  abstract has(name: string): any

  /**
   * Deletes a holder by name.
   * @param name The name of the holder to delete
   * @returns true if the holder was deleted, false if it didn't exist
   */
  delete(name: string): boolean {
    return this._holders.delete(name)
  }

  /**
   * Filters holders based on a predicate function.
   * @param predicate Function to test each holder
   * @returns A new Map containing only the holders that match the predicate
   */
  filter(
    predicate: (
      value: ServiceLocatorInstanceHolder<any>,
      key: string,
    ) => boolean,
  ): Map<string, ServiceLocatorInstanceHolder> {
    return new Map(
      [...this._holders].filter(([key, value]) => predicate(value, key)),
    )
  }

  /**
   * Clears all holders from this manager.
   */
  clear(): void {
    this._holders.clear()
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
   * @param ttl Optional time-to-live in milliseconds (defaults to Infinity)
   * @returns A tuple containing the deferred promise and the holder
   */
  createCreatingHolder<Instance>(
    name: string,
    type: InjectableType,
    scope: InjectableScope,
    deps: Set<string> = new Set(),
    ttl: number = Infinity,
  ): [
    ReturnType<typeof Promise.withResolvers<[undefined, Instance]>>,
    ServiceLocatorInstanceHolder<Instance>,
  ] {
    const deferred = Promise.withResolvers<[undefined, Instance]>()

    const holder: ServiceLocatorInstanceHolder<Instance> = {
      status: ServiceLocatorInstanceHolderStatus.Creating,
      name,
      instance: null,
      creationPromise: deferred.promise,
      destroyPromise: null,
      type,
      scope,
      deps,
      destroyListeners: [],
      createdAt: Date.now(),
      ttl,
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
   * @param ttl Optional time-to-live in milliseconds (defaults to Infinity)
   * @returns The created holder
   */
  protected createCreatedHolder<Instance>(
    name: string,
    instance: Instance,
    type: InjectableType,
    scope: InjectableScope,
    deps: Set<string> = new Set(),
    ttl: number = Infinity,
  ): ServiceLocatorInstanceHolder<Instance> {
    const holder: ServiceLocatorInstanceHolder<Instance> = {
      status: ServiceLocatorInstanceHolderStatus.Created,
      name,
      instance,
      creationPromise: null,
      destroyPromise: null,
      type,
      scope,
      deps,
      destroyListeners: [],
      createdAt: Date.now(),
      ttl,
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
  getAllHolders(): ServiceLocatorInstanceHolder[] {
    return Array.from(this._holders.values())
  }

  /**
   * Checks if this manager has any holders.
   */
  isEmpty(): boolean {
    return this._holders.size === 0
  }
}
