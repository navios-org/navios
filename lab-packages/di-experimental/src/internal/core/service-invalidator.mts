import type { IHolderStorage } from '../holder/holder-storage.interface.mjs'
import type { InstanceHolder } from '../holder/instance-holder.mjs'
import type { LifecycleEventBus } from '../lifecycle/lifecycle-event-bus.mjs'

import { DIError } from '../../errors/index.mjs'
import { InstanceStatus } from '../holder/instance-holder.mjs'

export interface ClearAllOptions {
  /** Maximum number of invalidation rounds to prevent infinite loops (default: 10) */
  maxRounds?: number
  /** Whether to wait for all services to settle before starting (default: true) */
  waitForSettlement?: boolean
}

export interface InvalidationOptions {
  /** Whether to emit events after invalidation (default: true) */
  emitEvents?: boolean
  /** Custom event emitter function */
  onInvalidated?: (instanceName: string) => Promise<void>
  /** Whether to cascade invalidation to dependents (default: false - events handle it) */
  cascade?: boolean
}

/**
 * Manages graceful service cleanup with event-based invalidation.
 *
 * Uses event subscriptions instead of manual dependent finding.
 * When a service is created, it subscribes to destroy events of its dependencies.
 * When a dependency is destroyed, the event automatically invalidates dependents.
 */
export class ServiceInvalidator {
  constructor(
    private readonly eventBus: LifecycleEventBus | null,
    private readonly logger: Console | null = null,
  ) {}

  /**
   * Invalidates a service using a specific storage.
   * Event-based invalidation means dependents are automatically invalidated
   * via destroy event subscriptions - no need to manually find dependents.
   *
   * @param service The instance name to invalidate
   * @param storage The storage to use for this invalidation
   * @param options Additional options for invalidation behavior
   */
  async invalidateWithStorage(
    service: string,
    storage: IHolderStorage,
    options: InvalidationOptions = {},
  ): Promise<void> {
    const { emitEvents = true, onInvalidated } = options

    this.logger?.log(
      `[ServiceInvalidator] Starting invalidation process for ${service}`,
    )

    const result = storage.get(service)
    if (result === null) {
      return
    }

    const [, holder] = result
    if (holder) {
      await this.invalidateHolderWithStorage(
        service,
        holder,
        storage,
        emitEvents,
        onInvalidated,
      )
    }
  }

  /**
   * Sets up destroy event subscriptions for a service's dependencies.
   * Called when a service is successfully instantiated.
   *
   * @param serviceName The name of the service
   * @param dependencies The set of dependency names
   * @param storage The storage to use for invalidation
   * @param holder The holder for the service (to add unsubscribe to destroy listeners)
   */
  setupDependencySubscriptions(
    serviceName: string,
    dependencies: Set<string>,
    storage: IHolderStorage,
    holder: InstanceHolder,
  ): void {
    if (!this.eventBus) {
      return
    }

    for (const dependencyName of dependencies) {
      // Subscribe to the dependency's destroy event
      const unsubscribe = this.eventBus.on(dependencyName, 'destroy', () => {
        this.logger?.log(
          `[ServiceInvalidator] Dependency ${dependencyName} destroyed, invalidating ${serviceName}`,
        )
        // Automatically invalidate this service when dependency is destroyed
        this.invalidateWithStorage(serviceName, storage).catch((error) => {
          this.logger?.error(
            `[ServiceInvalidator] Error invalidating ${serviceName} after dependency ${dependencyName} destroyed:`,
            error,
          )
        })
      })

      // Store unsubscribe function in the service's destroy listeners
      // so it's cleaned up when the service is destroyed
      holder.destroyListeners.push(unsubscribe)
    }
  }

  /**
   * Gracefully clears all services in a specific storage.
   * This allows clearing request-scoped services using a RequestStorage.
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

      // Clear services - events will handle dependent invalidation
      const clearPromises = allServiceNames.map((serviceName) =>
        this.invalidateWithStorage(serviceName, storage),
      )

      await Promise.all(clearPromises)
    }

    this.logger?.log('[ServiceInvalidator] Graceful clearing completed')
  }

  /**
   * Waits for all services in a specific storage to settle.
   */
  async readyWithStorage(storage: IHolderStorage): Promise<void> {
    const holders: InstanceHolder<any>[] = []
    storage.forEach((_: string, holder: InstanceHolder) => holders.push(holder))
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
    holder: InstanceHolder<any>,
    storage: IHolderStorage,
    emitEvents: boolean,
    onInvalidated?: (instanceName: string) => Promise<void>,
  ): Promise<void> {
    await this.invalidateHolderByStatus(holder, {
      context: key,
      onDestroy: () =>
        this.destroyHolderWithStorage(
          key,
          holder,
          storage,
          emitEvents,
          onInvalidated,
        ),
    })
  }

  /**
   * Common invalidation logic for holders based on their status.
   */
  private async invalidateHolderByStatus(
    holder: InstanceHolder<any>,
    options: {
      context: string
      onDestroy: () => Promise<void>
    },
  ): Promise<void> {
    switch (holder.status) {
      case InstanceStatus.Destroying:
        await holder.destroyPromise
        break

      case InstanceStatus.Creating:
        // Wait for creation to complete before destroying
        await holder.creationPromise
        await options.onDestroy()
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
    holder: InstanceHolder<any>,
    storage: IHolderStorage,
    emitEvents: boolean,
    onInvalidated?: (instanceName: string) => Promise<void>,
  ): Promise<void> {
    holder.status = InstanceStatus.Destroying
    this.logger?.log(
      `[ServiceInvalidator] Invalidating ${key} and notifying listeners`,
    )

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
    holder: InstanceHolder<any>,
  ): Promise<void> {
    switch (holder.status) {
      case InstanceStatus.Creating:
        await holder.creationPromise
        break
      case InstanceStatus.Destroying:
        await holder.destroyPromise
        break
      // Already settled states
      case InstanceStatus.Created:
      case InstanceStatus.Error:
        break
    }
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
