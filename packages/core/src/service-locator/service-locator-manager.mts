/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { ServiceLocatorInstanceHolder } from './service-locator-instance-holder.mjs'

import {
  ErrorsEnum,
  InstanceDestroying,
  InstanceExpired,
  InstanceNotFound,
} from './errors/index.mjs'
import { ServiceLocatorInstanceHolderStatus } from './service-locator-instance-holder.mjs'

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
}
