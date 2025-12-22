import type { InjectableScope, InjectableType } from '../../enums/index.mjs'
import type { DIError } from '../../errors/index.mjs'
import type { InstanceHolder } from './instance-holder.mjs'

/**
 * Result type for holder retrieval operations.
 * - [undefined, holder] - Holder found successfully
 * - [DIError, holder?] - Error occurred (holder may be available for waiting)
 * - null - No holder exists
 */
export type HolderGetResult<T = unknown> =
  | [undefined, InstanceHolder<T>]
  | [DIError, InstanceHolder<T>?]
  | null

/**
 * Interface for abstracting holder storage operations.
 *
 * Enables unified instance resolution logic regardless of where
 * holders are stored. This is the key abstraction for the unified storage pattern.
 */
export interface IHolderStorage {
  /**
   * The scope this storage handles.
   */
  readonly scope: InjectableScope

  // ============================================================================
  // BASIC OPERATIONS
  // ============================================================================

  /**
   * Retrieves an existing holder by instance name.
   *
   * @param instanceName The unique identifier for the instance
   * @returns
   *   - [undefined, holder] if found and ready/creating
   *   - [DIError, holder?] if found but in error/destroying state
   *   - null if not found
   */
  get<T = unknown>(instanceName: string): HolderGetResult<T>

  /**
   * Stores a holder by instance name.
   *
   * @param instanceName The unique identifier for the instance
   * @param holder The holder to store
   */
  set(instanceName: string, holder: InstanceHolder): void

  /**
   * Deletes a holder by instance name.
   *
   * @param instanceName The unique identifier for the instance
   * @returns true if the holder was deleted, false if it didn't exist
   */
  delete(instanceName: string): boolean

  /**
   * Creates a new holder in "Creating" state with a deferred promise.
   * The holder is NOT automatically stored - call set() to store it.
   *
   * @param instanceName The unique identifier for the instance
   * @param type The injectable type
   * @param deps The set of dependency names
   * @returns A tuple containing the deferred promise resolver and the holder
   */
  createHolder<T>(
    instanceName: string,
    type: InjectableType,
    deps: Set<string>,
  ): [
    ReturnType<typeof Promise.withResolvers<[undefined, T]>>,
    InstanceHolder<T>,
  ]

  /**
   * Checks if this storage should be used for the given scope.
   */
  handles(scope: InjectableScope): boolean

  // ============================================================================
  // ITERATION AND QUERY
  // ============================================================================

  /**
   * Gets all instance names in this storage.
   */
  getAllNames(): string[]

  /**
   * Iterates over all holders with a callback.
   *
   * @param callback Function called for each holder with (name, holder)
   */
  forEach(callback: (name: string, holder: InstanceHolder) => void): void

  /**
   * Finds a holder by its instance value (reverse lookup).
   *
   * @param instance The instance to search for
   * @returns The holder if found, null otherwise
   */
  findByInstance(instance: unknown): InstanceHolder | null

  /**
   * Finds all instance names that depend on the given instance name.
   *
   * @param instanceName The instance name to find dependents for
   * @returns Array of instance names that have this instance as a dependency
   */
  findDependents(instanceName: string): string[]

  /**
   * Updates dependency references when instance names change.
   * Used during scope upgrades when instance names are regenerated with requestId.
   *
   * @param oldName The old instance name
   * @param newName The new instance name
   */
  updateDependencyReference(oldName: string, newName: string): void
}
