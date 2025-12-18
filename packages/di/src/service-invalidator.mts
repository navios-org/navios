/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ServiceLocatorEventBus } from './service-locator-event-bus.mjs'
import type { ServiceLocatorInstanceHolder } from './service-locator-instance-holder.mjs'
import type { ServiceLocatorManager } from './service-locator-manager.mjs'

import { ServiceLocatorInstanceHolderStatus } from './service-locator-instance-holder.mjs'

export interface ClearAllOptions {
  /** Maximum number of invalidation rounds to prevent infinite loops (default: 10) */
  maxRounds?: number
  /** Whether to wait for all services to settle before starting (default: true) */
  waitForSettlement?: boolean
}

/**
 * ServiceInvalidator handles service invalidation, cleanup, and graceful clearing.
 * Extracted from ServiceLocator to improve separation of concerns.
 *
 * Note: Request-scoped service invalidation is handled by ScopedContainer directly.
 * This class only manages singleton and transient service invalidation.
 */
export class ServiceInvalidator {
  constructor(
    private readonly manager: ServiceLocatorManager,
    private readonly eventBus: ServiceLocatorEventBus,
    private readonly logger: Console | null = null,
  ) {}

  /**
   * Invalidates a service and all its dependencies.
   */
  invalidate(service: string, round = 1): Promise<any> {
    this.logger?.log(
      `[ServiceInvalidator] Starting invalidation process for ${service}`,
    )
    const [, toInvalidate] = this.manager.get(service)

    const promises = []
    if (toInvalidate) {
      promises.push(this.invalidateHolder(service, toInvalidate, round))
    }

    return Promise.all(promises)
  }

  /**
   * Gracefully clears all services in the ServiceLocator using invalidation logic.
   * This method respects service dependencies and ensures proper cleanup order.
   * Services that depend on others will be invalidated first, then their dependencies.
   *
   * Note: Request-scoped services are managed by ScopedContainer and are
   * cleaned up when the request ends via ScopedContainer.endRequest().
   */
  async clearAll(options: ClearAllOptions = {}): Promise<void> {
    const {
      maxRounds = 10,
      waitForSettlement = true,
    } = options

    this.logger?.log(
      '[ServiceInvalidator] Starting graceful clearing of all services',
    )

    // Wait for all services to settle if requested
    if (waitForSettlement) {
      this.logger?.log(
        '[ServiceInvalidator] Waiting for all services to settle...',
      )
      await this.ready()
    }

    // Get all service names that need to be cleared
    const allServiceNames = this.getAllServiceNames()

    if (allServiceNames.length === 0) {
      this.logger?.log('[ServiceInvalidator] No singleton services to clear')
    } else {
      this.logger?.log(
        `[ServiceInvalidator] Found ${allServiceNames.length} services to clear: ${allServiceNames.join(', ')}`,
      )

      // Clear services using dependency-aware invalidation
      await this.clearServicesWithDependencyAwareness(
        allServiceNames,
        maxRounds,
      )
    }

    this.logger?.log('[ServiceInvalidator] Graceful clearing completed')
  }

  /**
   * Waits for all services to settle (either created, destroyed, or error state).
   */
  async ready(): Promise<void> {
    const holders = Array.from(this.manager.filter(() => true)).map(
      ([, holder]) => holder,
    )
    await Promise.all(
      holders.map((holder) => this.waitForHolderToSettle(holder)),
    )
  }

  /**
   * Invalidates a single holder based on its current status.
   */
  private async invalidateHolder(
    key: string,
    holder: ServiceLocatorInstanceHolder<any>,
    round: number,
  ): Promise<void> {
    await this.invalidateHolderByStatus(holder, round, {
      context: key,
      onCreationError: () =>
        this.logger?.error(
          `[ServiceInvalidator] ${key} creation triggered too many invalidation rounds`,
        ),
      onRecursiveInvalidate: () => this.invalidate(key, round + 1),
      onDestroy: () => this.destroyHolder(key, holder),
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
   * Destroys a holder and cleans up its resources.
   */
  private async destroyHolder(
    key: string,
    holder: ServiceLocatorInstanceHolder<any>,
  ): Promise<void> {
    await this.destroyHolderWithCleanup(holder, {
      context: key,
      logMessage: `[ServiceInvalidator] Invalidating ${key} and notifying listeners`,
      cleanup: () => this.manager.delete(key),
      eventName: key,
    })
  }

  /**
   * Common destroy logic for holders with customizable cleanup.
   */
  private async destroyHolderWithCleanup(
    holder: ServiceLocatorInstanceHolder<any>,
    options: {
      context: string
      logMessage: string
      cleanup: () => void
      eventName: string
    },
  ): Promise<void> {
    holder.status = ServiceLocatorInstanceHolderStatus.Destroying
    this.logger?.log(options.logMessage)

    holder.destroyPromise = Promise.all(
      holder.destroyListeners.map((listener) => listener()),
    ).then(async () => {
      holder.destroyListeners = []
      holder.deps.clear()
      options.cleanup()
      await this.emitInstanceEvent(options.eventName, 'destroy')
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
   * Clears services with dependency awareness, ensuring proper cleanup order.
   * Services with no dependencies are cleared first, then services that depend on them.
   */
  private async clearServicesWithDependencyAwareness(
    serviceNames: string[],
    maxRounds: number,
  ): Promise<void> {
    const clearedServices = new Set<string>()
    let round = 1

    while (clearedServices.size < serviceNames.length && round <= maxRounds) {
      this.logger?.log(
        `[ServiceInvalidator] Clearing round ${round}/${maxRounds}, ${clearedServices.size}/${serviceNames.length} services cleared`,
      )

      // Find services that can be cleared in this round
      const servicesToClearThisRound = this.findServicesReadyForClearing(
        serviceNames,
        clearedServices,
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
          await this.forceClearServices(remainingServices)
          remainingServices.forEach((name) => clearedServices.add(name))
        }
        break
      }

      // Clear services in this round
      const clearPromises = servicesToClearThisRound.map(
        async (serviceName) => {
          try {
            await this.invalidate(serviceName, round)
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
  private findServicesReadyForClearing(
    allServiceNames: string[],
    clearedServices: Set<string>,
  ): string[] {
    return allServiceNames.filter((serviceName) => {
      if (clearedServices.has(serviceName)) {
        return false // Already cleared
      }

      // Check if this service has any dependencies that haven't been cleared yet
      const [error, holder] = this.manager.get(serviceName)
      if (error) {
        return true // Service not found or in error state, can be cleared
      }

      // Check if all dependencies have been cleared
      const hasUnclearedDependencies = Array.from(holder.deps).some(
        (dep) => !clearedServices.has(dep),
      )

      return !hasUnclearedDependencies
    })
  }

  /**
   * Force clears services that couldn't be cleared through normal dependency resolution.
   * This handles edge cases like circular dependencies.
   */
  private async forceClearServices(serviceNames: string[]): Promise<void> {
    const promises = serviceNames.map(async (serviceName) => {
      try {
        // Directly destroy the holder without going through normal invalidation
        const [error, holder] = this.manager.get(serviceName)
        if (!error && holder) {
          await this.destroyHolder(serviceName, holder)
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
   * Gets all service names currently managed by the ServiceLocator.
   */
  private getAllServiceNames(): string[] {
    return this.manager.getAllNames()
  }

  /**
   * Emits events to listeners for instance lifecycle events.
   */
  private emitInstanceEvent(
    name: string,
    event: 'create' | 'destroy' = 'create',
  ) {
    this.logger?.log(
      `[ServiceInvalidator]#emitInstanceEvent() Notifying listeners for ${name} with event ${event}`,
    )
    return this.eventBus.emit(name, event)
  }
}
