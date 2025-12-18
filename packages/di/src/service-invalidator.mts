/* eslint-disable @typescript-eslint/no-explicit-any */
import type { IHolderStorage } from './interfaces/holder-storage.interface.mjs'
import type { ServiceLocatorEventBus } from './service-locator-event-bus.mjs'
import type { ServiceLocatorInstanceHolder } from './service-locator-instance-holder.mjs'
import type { ServiceLocatorManager } from './service-locator-manager.mjs'

import { ServiceLocatorInstanceHolderStatus } from './service-locator-instance-holder.mjs'
import { SingletonHolderStorage } from './singleton-holder-storage.mjs'

export interface ClearAllOptions {
  /** Maximum number of invalidation rounds to prevent infinite loops (default: 10) */
  maxRounds?: number
  /** Whether to wait for all services to settle before starting (default: true) */
  waitForSettlement?: boolean
}

export interface InvalidationOptions {
  /** Whether to emit events after invalidation (default: true for singletons) */
  emitEvents?: boolean
  /** Custom event emitter function */
  onInvalidated?: (instanceName: string) => Promise<void>
  /** Whether to cascade invalidation to dependents (default: true) */
  cascade?: boolean
  /** Internal: tracks services being invalidated in the current call chain to prevent circular loops */
  _invalidating?: Set<string>
}

/**
 * ServiceInvalidator handles service invalidation, cleanup, and graceful clearing.
 * Extracted from ServiceLocator to improve separation of concerns.
 *
 * This class works with any IHolderStorage implementation, enabling unified
 * invalidation logic for both singleton and request-scoped services.
 */
export class ServiceInvalidator {
  private readonly storage: IHolderStorage

  constructor(
    manager: ServiceLocatorManager,
    private readonly eventBus: ServiceLocatorEventBus | null,
    private readonly logger: Console | null = null,
  ) {
    this.storage = new SingletonHolderStorage(manager)
  }

  /**
   * Invalidates a service and all its dependencies.
   * Works with the configured storage (singleton by default).
   */
  invalidate(service: string, round = 1): Promise<any> {
    return this.invalidateWithStorage(service, this.storage, round)
  }

  /**
   * Invalidates a service using a specific storage.
   * This allows request-scoped invalidation using a RequestHolderStorage.
   *
   * @param service The instance name to invalidate
   * @param storage The storage to use for this invalidation
   * @param round Current invalidation round (for recursion limiting)
   * @param options Additional options for invalidation behavior
   */
  async invalidateWithStorage(
    service: string,
    storage: IHolderStorage,
    round = 1,
    options: InvalidationOptions = {},
  ): Promise<void> {
    const { cascade = true, _invalidating = new Set<string>() } = options

    // Prevent infinite recursion from circular dependencies
    if (_invalidating.has(service)) {
      this.logger?.log(
        `[ServiceInvalidator] Skipping ${service} - already being invalidated in this chain`,
      )
      return
    }

    this.logger?.log(
      `[ServiceInvalidator] Starting invalidation process for ${service}`,
    )

    const result = storage.get(service)
    if (result === null) {
      return
    }

    // Mark this service as being invalidated
    _invalidating.add(service)

    // Pass the tracking set to cascaded invalidations
    const optionsWithTracking = { ...options, _invalidating }

    // Cascade invalidation: first invalidate all services that depend on this one
    if (cascade) {
      const dependents = storage.findDependents(service)
      for (const dependentName of dependents) {
        await this.invalidateWithStorage(dependentName, storage, round, optionsWithTracking)
      }
    }

    const [, holder] = result
    if (holder) {
      await this.invalidateHolderWithStorage(service, holder, storage, round, optionsWithTracking)
    }
  }

  /**
   * Gracefully clears all services using invalidation logic.
   * This method respects service dependencies and ensures proper cleanup order.
   * Services that depend on others will be invalidated first, then their dependencies.
   */
  async clearAll(options: ClearAllOptions = {}): Promise<void> {
    return this.clearAllWithStorage(this.storage, options)
  }

  /**
   * Gracefully clears all services in a specific storage.
   * This allows clearing request-scoped services using a RequestHolderStorage.
   */
  async clearAllWithStorage(
    storage: IHolderStorage,
    options: ClearAllOptions = {},
  ): Promise<void> {
    const { maxRounds = 10, waitForSettlement = true } = options

    this.logger?.log(
      '[ServiceInvalidator] Starting graceful clearing of all services',
    )

    // Wait for all services to settle if requested
    if (waitForSettlement) {
      this.logger?.log(
        '[ServiceInvalidator] Waiting for all services to settle...',
      )
      await this.readyWithStorage(storage)
    }

    // Get all service names that need to be cleared
    const allServiceNames = storage.getAllNames()

    if (allServiceNames.length === 0) {
      this.logger?.log('[ServiceInvalidator] No services to clear')
    } else {
      this.logger?.log(
        `[ServiceInvalidator] Found ${allServiceNames.length} services to clear: ${allServiceNames.join(', ')}`,
      )

      // Clear services using dependency-aware invalidation
      await this.clearServicesWithDependencyAwarenessForStorage(
        allServiceNames,
        maxRounds,
        storage,
      )
    }

    this.logger?.log('[ServiceInvalidator] Graceful clearing completed')
  }

  /**
   * Waits for all services to settle (either created, destroyed, or error state).
   */
  async ready(): Promise<void> {
    return this.readyWithStorage(this.storage)
  }

  /**
   * Waits for all services in a specific storage to settle.
   */
  async readyWithStorage(storage: IHolderStorage): Promise<void> {
    const holders: ServiceLocatorInstanceHolder<any>[] = []
    storage.forEach((_, holder) => holders.push(holder))
    await Promise.all(
      holders.map((holder) => this.waitForHolderToSettle(holder)),
    )
  }

  // ============================================================================
  // INTERNAL INVALIDATION HELPERS
  // ============================================================================

  /**
   * Invalidates a single holder using a specific storage.
   */
  private async invalidateHolderWithStorage(
    key: string,
    holder: ServiceLocatorInstanceHolder<any>,
    storage: IHolderStorage,
    round: number,
    options: InvalidationOptions = {},
  ): Promise<void> {
    const { emitEvents = true, onInvalidated } = options

    await this.invalidateHolderByStatus(holder, round, {
      context: key,
      onCreationError: () =>
        this.logger?.error(
          `[ServiceInvalidator] ${key} creation triggered too many invalidation rounds`,
        ),
      onRecursiveInvalidate: () =>
        this.invalidateWithStorage(key, storage, round + 1, options),
      onDestroy: () =>
        this.destroyHolderWithStorage(key, holder, storage, emitEvents, onInvalidated),
    })
  }

  /**
   * Common invalidation logic for holders based on their status.
   */
  private async invalidateHolderByStatus(
    holder: ServiceLocatorInstanceHolder<any>,
    round: number,
    options: {
      context: string
      onCreationError: () => void
      onRecursiveInvalidate: () => Promise<void>
      onDestroy: () => Promise<void>
    },
  ): Promise<void> {
    switch (holder.status) {
      case ServiceLocatorInstanceHolderStatus.Destroying:
        await holder.destroyPromise
        break

      case ServiceLocatorInstanceHolderStatus.Creating:
        await holder.creationPromise
        if (round > 3) {
          options.onCreationError()
          return
        }
        await options.onRecursiveInvalidate()
        break

      default:
        await options.onDestroy()
        break
    }
  }

  /**
   * Destroys a holder using a specific storage.
   */
  private async destroyHolderWithStorage(
    key: string,
    holder: ServiceLocatorInstanceHolder<any>,
    storage: IHolderStorage,
    emitEvents: boolean,
    onInvalidated?: (instanceName: string) => Promise<void>,
  ): Promise<void> {
    holder.status = ServiceLocatorInstanceHolderStatus.Destroying
    this.logger?.log(`[ServiceInvalidator] Invalidating ${key} and notifying listeners`)

    holder.destroyPromise = Promise.all(
      holder.destroyListeners.map((listener) => listener()),
    ).then(async () => {
      holder.destroyListeners = []
      holder.deps.clear()
      storage.delete(key)

      // Emit events if enabled and event bus exists
      if (emitEvents && this.eventBus) {
        await this.emitInstanceEvent(key, 'destroy')
      }

      // Call custom callback if provided
      if (onInvalidated) {
        await onInvalidated(key)
      }
    })

    await holder.destroyPromise
  }

  /**
   * Waits for a holder to settle (either created, destroyed, or error state).
   */
  private async waitForHolderToSettle(
    holder: ServiceLocatorInstanceHolder<any>,
  ): Promise<void> {
    switch (holder.status) {
      case ServiceLocatorInstanceHolderStatus.Creating:
        await holder.creationPromise
        break
      case ServiceLocatorInstanceHolderStatus.Destroying:
        await holder.destroyPromise
        break
      // Already settled states
      case ServiceLocatorInstanceHolderStatus.Created:
      case ServiceLocatorInstanceHolderStatus.Error:
        break
    }
  }

  /**
   * Clears services with dependency awareness for a specific storage.
   */
  private async clearServicesWithDependencyAwarenessForStorage(
    serviceNames: string[],
    maxRounds: number,
    storage: IHolderStorage,
  ): Promise<void> {
    const clearedServices = new Set<string>()
    let round = 1

    while (clearedServices.size < serviceNames.length && round <= maxRounds) {
      this.logger?.log(
        `[ServiceInvalidator] Clearing round ${round}/${maxRounds}, ${clearedServices.size}/${serviceNames.length} services cleared`,
      )

      // Find services that can be cleared in this round
      const servicesToClearThisRound = this.findServicesReadyForClearingInStorage(
        serviceNames,
        clearedServices,
        storage,
      )

      if (servicesToClearThisRound.length === 0) {
        // If no services can be cleared, try to clear remaining services anyway
        // This handles circular dependencies or other edge cases
        const remainingServices = serviceNames.filter(
          (name) => !clearedServices.has(name),
        )

        if (remainingServices.length > 0) {
          this.logger?.warn(
            `[ServiceInvalidator] No services ready for clearing, forcing cleanup of remaining: ${remainingServices.join(', ')}`,
          )
          await this.forceClearServicesInStorage(remainingServices, storage)
          remainingServices.forEach((name) => clearedServices.add(name))
        }
        break
      }

      // Clear services in this round
      const clearPromises = servicesToClearThisRound.map(
        async (serviceName) => {
          try {
            await this.invalidateWithStorage(serviceName, storage, round)
            clearedServices.add(serviceName)
            this.logger?.log(
              `[ServiceInvalidator] Successfully cleared service: ${serviceName}`,
            )
          } catch (error) {
            this.logger?.error(
              `[ServiceInvalidator] Error clearing service ${serviceName}:`,
              error,
            )
            // Still mark as cleared to avoid infinite loops
            clearedServices.add(serviceName)
          }
        },
      )

      await Promise.all(clearPromises)
      round++
    }

    if (clearedServices.size < serviceNames.length) {
      this.logger?.warn(
        `[ServiceInvalidator] Clearing completed after ${maxRounds} rounds, but ${serviceNames.length - clearedServices.size} services may not have been properly cleared`,
      )
    }
  }

  /**
   * Finds services that are ready to be cleared in the current round.
   * A service is ready if all its dependencies have already been cleared.
   */
  private findServicesReadyForClearingInStorage(
    allServiceNames: string[],
    clearedServices: Set<string>,
    storage: IHolderStorage,
  ): string[] {
    return allServiceNames.filter((serviceName) => {
      if (clearedServices.has(serviceName)) {
        return false // Already cleared
      }

      // Check if this service has any dependencies that haven't been cleared yet
      const result = storage.get(serviceName)
      if (result === null || result[0]) {
        return true // Service not found or in error state, can be cleared
      }

      const [, holder] = result
      // Check if all dependencies have been cleared
      const hasUnclearedDependencies = Array.from(holder!.deps).some(
        (dep) => !clearedServices.has(dep),
      )

      return !hasUnclearedDependencies
    })
  }

  /**
   * Force clears services that couldn't be cleared through normal dependency resolution.
   * This handles edge cases like circular dependencies.
   */
  private async forceClearServicesInStorage(
    serviceNames: string[],
    storage: IHolderStorage,
  ): Promise<void> {
    const promises = serviceNames.map(async (serviceName) => {
      try {
        // Directly destroy the holder without going through normal invalidation
        const result = storage.get(serviceName)
        if (result !== null && !result[0]) {
          const [, holder] = result
          await this.destroyHolderWithStorage(serviceName, holder!, storage, true)
        }
      } catch (error) {
        this.logger?.error(
          `[ServiceInvalidator] Error force clearing service ${serviceName}:`,
          error,
        )
      }
    })

    await Promise.all(promises)
  }

  /**
   * Emits events to listeners for instance lifecycle events.
   */
  private emitInstanceEvent(
    name: string,
    event: 'create' | 'destroy' = 'create',
  ) {
    if (!this.eventBus) {
      return Promise.resolve()
    }
    this.logger?.log(
      `[ServiceInvalidator]#emitInstanceEvent() Notifying listeners for ${name} with event ${event}`,
    )
    return this.eventBus.emit(name, event)
  }
}
