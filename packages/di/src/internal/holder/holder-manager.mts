import type { InstanceHolder } from './instance-holder.mjs'

import { InjectableScope, InjectableType } from '../../enums/index.mjs'
import { DIError, DIErrorCode } from '../../errors/index.mjs'
import { BaseHolderManager } from './base-holder-manager.mjs'
import { InstanceStatus } from './instance-holder.mjs'

/**
 * Manages the storage and retrieval of singleton instance holders.
 *
 * Provides CRUD operations and filtering for the holder map.
 * Handles holder state validation (destroying, error states) on retrieval.
 */
export class HolderManager extends BaseHolderManager {
  constructor(logger: Console | null = null) {
    super(logger)
  }

  get(
    name: string,
  ): [DIError, InstanceHolder] | [DIError] | [undefined, InstanceHolder] {
    const holder = this._holders.get(name)
    if (holder) {
      if (holder.status === InstanceStatus.Destroying) {
        this.logger?.log(
          `[HolderManager]#get() Instance ${holder.name} is destroying`,
        )
        return [DIError.instanceDestroying(holder.name), holder]
      } else if (holder.status === InstanceStatus.Error) {
        this.logger?.log(
          `[HolderManager]#get() Instance ${holder.name} is in error state`,
        )
        return [holder.instance as unknown as DIError, holder]
      }

      return [undefined, holder]
    } else {
      this.logger?.log(`[HolderManager]#get() Instance ${name} not found`)
      return [DIError.instanceNotFound(name)]
    }
  }

  set(name: string, holder: InstanceHolder): void {
    this._holders.set(name, holder)
  }

  has(name: string): [DIError] | [undefined, boolean] {
    const [error, holder] = this.get(name)
    if (!error) {
      return [undefined, true]
    }
    if (error.code === DIErrorCode.InstanceDestroying) {
      return [error]
    }
    return [undefined, !!holder]
  }

  // delete and filter methods are inherited from BaseHolderManager

  // createCreatingHolder method is inherited from BaseHolderManager

  /**
   * Creates a new holder with Created status and stores it.
   * This is useful for creating holders that already have their instance ready.
   * @param name The name of the instance
   * @param instance The actual instance to store
   * @param type The injectable type
   * @param scope The injectable scope
   * @param deps Optional set of dependencies
   * @returns The created holder
   */
  storeCreatedHolder<Instance>(
    name: string,
    instance: Instance,
    type: InjectableType,
    scope: InjectableScope,
    deps: Set<string> = new Set(),
  ): InstanceHolder<Instance> {
    const holder = this.createCreatedHolder(name, instance, type, scope, deps)

    this._holders.set(name, holder)

    return holder
  }
}

/** @deprecated Use HolderManager instead */
export const ServiceLocatorManager = HolderManager
