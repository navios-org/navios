import type { RequestContext } from '../context/request-context.mjs'
import type { BaseHolderManager } from './base-holder-manager.mjs'
import type {
  HolderGetResult,
  IHolderStorage,
} from './holder-storage.interface.mjs'
import type { InstanceHolder } from './instance-holder.mjs'

import { InjectableScope, InjectableType } from '../../enums/index.mjs'
import { DIError } from '../../errors/index.mjs'
import { InstanceStatus } from './instance-holder.mjs'

/**
 * Storage implementation for Request-scoped services.
 *
 * Wraps a RequestContext instance from a ScopedContainer and provides
 * the IHolderStorage interface. This allows the InstanceResolver to work
 * with request-scoped storage using the same interface as singleton storage.
 */
export class RequestStorage implements IHolderStorage {
  readonly scope = InjectableScope.Request

  constructor(
    private readonly contextHolder: RequestContext,
    private readonly holderManager: BaseHolderManager,
  ) {}

  get<T = unknown>(instanceName: string): HolderGetResult<T> {
    const holder = this.contextHolder.get(instanceName)

    if (!holder) {
      return null
    }

    // Check holder status for error states
    switch (holder.status) {
      case InstanceStatus.Destroying:
        return [
          DIError.instanceDestroying(instanceName),
          holder as InstanceHolder<T>,
        ]

      case InstanceStatus.Error:
        return [
          holder.instance as unknown as DIError,
          holder as InstanceHolder<T>,
        ]

      case InstanceStatus.Creating:
      case InstanceStatus.Created:
        return [undefined, holder as InstanceHolder<T>]

      default:
        return null
    }
  }

  set(instanceName: string, holder: InstanceHolder): void {
    this.contextHolder.set(instanceName, holder)
  }

  delete(instanceName: string): boolean {
    return this.contextHolder.delete(instanceName)
  }

  createHolder<T>(
    instanceName: string,
    type: InjectableType,
    deps: Set<string>,
  ): [
    ReturnType<typeof Promise.withResolvers<[undefined, T]>>,
    InstanceHolder<T>,
  ] {
    // Use the holderManager's createCreatingHolder method
    // which is inherited from BaseHolderManager
    return this.holderManager.createCreatingHolder<T>(
      instanceName,
      type,
      this.scope,
      deps,
    )
  }

  handles(scope: InjectableScope): boolean {
    return scope === InjectableScope.Request
  }

  // ============================================================================
  // ITERATION AND QUERY
  // ============================================================================

  getAllNames(): string[] {
    const names: string[] = []
    for (const [name] of this.contextHolder.holders) {
      names.push(name)
    }
    return names
  }

  forEach(callback: (name: string, holder: InstanceHolder) => void): void {
    for (const [name, holder] of this.contextHolder.holders) {
      callback(name, holder)
    }
  }

  findByInstance(instance: unknown): InstanceHolder | null {
    for (const holder of this.contextHolder.holders.values()) {
      if (holder.instance === instance) {
        return holder
      }
    }
    return null
  }

  findDependents(instanceName: string): string[] {
    const dependents: string[] = []

    // Check request-scoped holders
    for (const [name, holder] of this.contextHolder.holders) {
      if (holder.deps.has(instanceName)) {
        dependents.push(name)
      }
    }

    // Also check singleton holders - a singleton may depend on this request-scoped service
    for (const [name, holder] of this.holderManager.filter(() => true)) {
      if (holder.deps.has(instanceName)) {
        dependents.push(name)
      }
    }

    return dependents
  }
}

/** @deprecated Use RequestStorage instead */
export const RequestHolderStorage = RequestStorage
