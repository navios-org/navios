import { InjectableScope as Scope } from '../../enums/index.mjs'
import { DIError } from '../../errors/index.mjs'
import { Registry } from '../../token/registry.mjs'
import { InstanceStatus } from '../holder/instance-holder.mjs'

import type { InjectableScope } from '../../enums/index.mjs'
import type { InjectionToken } from '../../token/injection-token.mjs'
import type { IHolderStorage } from '../holder/holder-storage.interface.mjs'

import { NameResolver } from './name-resolver.mjs'

/**
 * Component for tracking and handling scope upgrades.
 *
 * Detects when a Singleton service needs to be upgraded to Request scope
 * and coordinates the scope upgrade process atomically.
 */
export class ScopeTracker {
  constructor(
    private readonly registry: Registry,
    private readonly nameResolver: NameResolver,
    private readonly logger: Console | null = null,
  ) {}

  /**
   * Checks if a dependency requires scope upgrade and performs it if needed.
   * Called during service resolution when a dependency is resolved.
   *
   * @param currentServiceName - Name of the service being created
   * @param currentServiceScope - Current scope of the service being created
   * @param dependencyName - Name of the dependency being resolved
   * @param dependencyScope - Scope of the dependency
   * @param dependencyToken - Token of the dependency
   * @param singletonStorage - Singleton storage instance
   * @param requestStorage - Request storage instance (if in request context)
   * @param requestId - Request ID (if in request context)
   * @returns [needsUpgrade: boolean, newName?: string] - whether upgrade occurred and new name
   */
  checkAndUpgradeScope(
    currentServiceName: string,
    currentServiceScope: InjectableScope,
    dependencyName: string,
    dependencyScope: InjectableScope,
    dependencyToken: InjectionToken<any, any>,
    singletonStorage: IHolderStorage,
    requestStorage?: IHolderStorage,
    requestId?: string,
  ): [boolean, string?] {
    // Only upgrade if current service is Singleton and dependency is Request
    if (currentServiceScope !== Scope.Singleton || dependencyScope !== Scope.Request) {
      return [false]
    }

    // Need request storage and requestId for upgrade
    if (!requestStorage || !requestId) {
      this.logger?.warn(
        `[ScopeTracker] Cannot upgrade scope for ${currentServiceName}: missing requestStorage or requestId`,
      )
      return [false]
    }

    // Perform the upgrade
    this.logger?.log(
      `[ScopeTracker] Upgrading ${currentServiceName} from Singleton to Request scope`,
    )

    try {
      const [success, newName] = this.upgradeScopeToRequestSync(
        currentServiceName,
        dependencyToken,
        singletonStorage,
        requestStorage,
        requestId,
      )

      if (success && newName) {
        return [true, newName]
      }
    } catch (error) {
      this.logger?.error(`[ScopeTracker] Error upgrading scope for ${currentServiceName}:`, error)
    }

    return [false]
  }

  /**
   * Performs the actual scope upgrade from Singleton to Request.
   * This is the core migration logic.
   *
   * @param serviceName - Current service name (without requestId)
   * @param token - Service injection token
   * @param singletonStorage - Source storage
   * @param requestStorage - Target storage
   * @param requestId - Request ID to include in new name
   * @returns [success: boolean, newName?: string, error?: DIError]
   */
  async upgradeScopeToRequest(
    serviceName: string,
    token: InjectionToken<any, any>,
    singletonStorage: IHolderStorage,
    requestStorage: IHolderStorage,
    requestId: string,
  ): Promise<[boolean, string?, DIError?]> {
    try {
      const [success, newName] = this.upgradeScopeToRequestSync(
        serviceName,
        token,
        singletonStorage,
        requestStorage,
        requestId,
      )

      if (success && newName) {
        return [true, newName]
      }
      return [
        false,
        undefined,
        DIError.storageError('Scope upgrade failed', 'upgradeScopeToRequest', serviceName),
      ]
    } catch (error) {
      return [false, undefined, error instanceof DIError ? error : DIError.unknown(error as Error)]
    }
  }

  /**
   * Synchronous part of scope upgrade - handles immediate updates.
   * Async operations (like waiting for holder creation) should be done separately.
   */
  private upgradeScopeToRequestSync(
    serviceName: string,
    token: InjectionToken<any, any>,
    singletonStorage: IHolderStorage,
    requestStorage: IHolderStorage,
    requestId: string,
  ): [boolean, string?] {
    // 1. Upgrade existing instance name to include requestId
    // This preserves any args hash that might be in the original name
    const newName = this.nameResolver.upgradeInstanceNameToRequest(serviceName, requestId)

    // 2. Update Registry scope to Request (synchronous)
    const updated = this.registry.updateScope(token, Scope.Request)
    if (!updated) {
      this.logger?.warn(`[ScopeTracker] Could not update scope in registry for ${serviceName}`)
      return [false]
    }

    // 3. Check if holder exists in singleton storage
    const holderResult = singletonStorage.get(serviceName)
    if (holderResult === null) {
      // No holder exists yet - just update registry, future resolutions will use request storage
      return [true, newName]
    }

    const [error, holder] = holderResult
    if (error) {
      this.logger?.warn(
        `[ScopeTracker] Holder for ${serviceName} is in error state: ${error.message}`,
      )
      return [false]
    }

    if (!holder) {
      return [false]
    }

    // 4. If holder is in "Creating" state, we need to wait for it before migrating
    // For now, we'll update the name and move it, but the caller should wait for creation
    if (holder.status === InstanceStatus.Creating) {
      // Update holder name
      holder.name = newName
      // Move to request storage
      requestStorage.set(newName, holder)
      // Remove from singleton storage
      singletonStorage.delete(serviceName)
      // Update parent dependencies
      this.updateParentDependencies(serviceName, newName, singletonStorage, requestStorage)
      return [true, newName]
    }

    // 5. Move holder from singleton to request storage
    holder.name = newName
    requestStorage.set(newName, holder)
    singletonStorage.delete(serviceName)

    // 6. Update all parent dependencies
    this.updateParentDependencies(serviceName, newName, singletonStorage, requestStorage)

    return [true, newName]
  }

  /**
   * Updates all parent dependencies to reference the new service name.
   *
   * @param oldName - Original service name
   * @param newName - New service name with requestId
   * @param singletonStorage - Singleton storage to check
   * @param requestStorage - Request storage to check
   */
  updateParentDependencies(
    oldName: string,
    newName: string,
    singletonStorage: IHolderStorage,
    requestStorage?: IHolderStorage,
  ): void {
    // Update dependencies in singleton storage
    singletonStorage.updateDependencyReference(oldName, newName)

    // Update dependencies in request storage if provided
    if (requestStorage) {
      requestStorage.updateDependencyReference(oldName, newName)
    }
  }
}
