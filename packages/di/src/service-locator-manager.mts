/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { ServiceLocatorInstanceHolder } from './service-locator-instance-holder.mjs'

import { InjectableScope, InjectableType } from './enums/index.mjs'
import {
  ErrorsEnum,
  InstanceDestroying,
  InstanceExpired,
  InstanceNotFound,
} from './errors/index.mjs'
import { ServiceLocatorInstanceHolderStatus } from './service-locator-instance-holder.mjs'
import { createDeferred } from './utils/defer.mjs'

export class ServiceLocatorManager {
  private readonly instancesHolders: Map<string, ServiceLocatorInstanceHolder> =
    new Map()

  constructor(private readonly logger: Console | null = null) {}

  get(
    name: string,
  ):
    | [InstanceExpired | InstanceDestroying, ServiceLocatorInstanceHolder]
    | [InstanceNotFound]
    | [undefined, ServiceLocatorInstanceHolder] {
    const holder = this.instancesHolders.get(name)
    if (holder) {
      if (holder.ttl !== Infinity) {
        const now = Date.now()
        if (now - holder.createdAt > holder.ttl) {
          this.logger?.log(
            `[ServiceLocatorManager]#getInstanceHolder() TTL expired for ${holder.name}`,
          )
          return [new InstanceExpired(holder.name), holder]
        }
      } else if (
        holder.status === ServiceLocatorInstanceHolderStatus.Destroying
      ) {
        this.logger?.log(
          `[ServiceLocatorManager]#getInstanceHolder() Instance ${holder.name} is destroying`,
        )
        return [new InstanceDestroying(holder.name), holder]
      } else if (holder.status === ServiceLocatorInstanceHolderStatus.Error) {
        this.logger?.log(
          `[ServiceLocatorManager]#getInstanceHolder() Instance ${holder.name} is in error state`,
        )
        return [holder.instance as InstanceNotFound, holder]
      }

      return [undefined, holder]
    } else {
      this.logger?.log(
        `[ServiceLocatorManager]#getInstanceHolder() Instance ${name} not found`,
      )
      return [new InstanceNotFound(name)]
    }
  }

  set(name: string, holder: ServiceLocatorInstanceHolder): void {
    this.instancesHolders.set(name, holder)
  }

  has(
    name: string,
  ): [InstanceExpired | InstanceDestroying] | [undefined, boolean] {
    const [error, holder] = this.get(name)
    if (!error) {
      return [undefined, true]
    }
    if (
      [ErrorsEnum.InstanceExpired, ErrorsEnum.InstanceDestroying].includes(
        error.code,
      )
    ) {
      return [error]
    }
    return [undefined, !!holder]
  }

  delete(name: string): boolean {
    return this.instancesHolders.delete(name)
  }

  filter(
    predicate: (
      value: ServiceLocatorInstanceHolder<any>,
      key: string,
    ) => boolean,
  ): Map<string, ServiceLocatorInstanceHolder> {
    return new Map(
      [...this.instancesHolders].filter(([key, value]) =>
        predicate(value, key),
      ),
    )
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
    ReturnType<typeof createDeferred<[undefined, Instance]>>,
    ServiceLocatorInstanceHolder<Instance>,
  ] {
    const deferred = createDeferred<[undefined, Instance]>()

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
  storeCreatedHolder<Instance>(
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

    this.instancesHolders.set(name, holder)

    return holder
  }
}
