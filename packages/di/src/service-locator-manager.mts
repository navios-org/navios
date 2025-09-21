/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { ServiceLocatorInstanceHolder } from './service-locator-instance-holder.mjs'

import { BaseInstanceHolderManager } from './base-instance-holder-manager.mjs'
import { InjectableScope, InjectableType } from './enums/index.mjs'
import { DIError, DIErrorCode } from './errors/index.mjs'
import { ServiceLocatorInstanceHolderStatus } from './service-locator-instance-holder.mjs'

export class ServiceLocatorManager extends BaseInstanceHolderManager {
  constructor(logger: Console | null = null) {
    super(logger)
  }

  get(
    name: string,
  ):
    | [DIError, ServiceLocatorInstanceHolder]
    | [DIError]
    | [undefined, ServiceLocatorInstanceHolder] {
    const holder = this._holders.get(name)
    if (holder) {
      if (holder.status === ServiceLocatorInstanceHolderStatus.Destroying) {
        this.logger?.log(
          `[ServiceLocatorManager]#getInstanceHolder() Instance ${holder.name} is destroying`,
        )
        return [DIError.instanceDestroying(holder.name), holder]
      } else if (holder.status === ServiceLocatorInstanceHolderStatus.Error) {
        this.logger?.log(
          `[ServiceLocatorManager]#getInstanceHolder() Instance ${holder.name} is in error state`,
        )
        return [holder.instance as DIError, holder]
      }

      return [undefined, holder]
    } else {
      this.logger?.log(
        `[ServiceLocatorManager]#getInstanceHolder() Instance ${name} not found`,
      )
      return [DIError.instanceNotFound(name)]
    }
  }

  set(name: string, holder: ServiceLocatorInstanceHolder): void {
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

  // delete and filter methods are inherited from BaseInstanceHolderManager

  // createCreatingHolder method is inherited from BaseInstanceHolderManager

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
  storeCreatedHolder<Instance>(
    name: string,
    instance: Instance,
    type: InjectableType,
    scope: InjectableScope,
    deps: Set<string> = new Set(),
  ): ServiceLocatorInstanceHolder<Instance> {
    const holder = this.createCreatedHolder(name, instance, type, scope, deps)

    this._holders.set(name, holder)

    return holder
  }
}
