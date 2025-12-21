import type { InstanceHolder } from '../holder/instance-holder.mjs'

import { BaseHolderManager } from '../holder/base-holder-manager.mjs'
import { InjectableScope, InjectableType } from '../../enums/index.mjs'
import { InjectionToken } from '../../token/injection-token.mjs'

/**
 * Interface for request context that manages pre-prepared instances for a specific request.
 *
 * Provides isolated storage for request-scoped services, enabling efficient
 * instantiation and cleanup within the lifecycle of a single request.
 */
export interface RequestContext {
  /**
   * Unique identifier for this request context.
   */
  readonly requestId: string

  /**
   * Instance holders for request-scoped services.
   */
  readonly holders: Map<string, InstanceHolder>

  /**
   * Priority for resolution in FactoryContext.inject method.
   * Higher values take precedence.
   */
  readonly priority: number

  /**
   * Request-specific metadata that can be used during instantiation.
   */
  readonly metadata: Map<string, any>

  /**
   * Timestamp when this context was created.
   */
  readonly createdAt: number

  /**
   * Adds a pre-prepared instance to this context.
   */
  addInstance(
    instanceName: string,
    instance: any,
    holder: InstanceHolder,
  ): void

  /**
   * Adds a pre-prepared instance to this context.
   */
  addInstance(token: InjectionToken<any, undefined>, instance: any): void

  /**
   * Gets an instance holder from this context.
   */
  get(instanceName: string): InstanceHolder | undefined

  /**
   * Sets an instance holder by name.
   */
  set(instanceName: string, holder: InstanceHolder): void

  /**
   * Checks if this context has a pre-prepared instance.
   */
  has(instanceName: string): boolean

  /**
   * Clears all instances and holders from this context.
   */
  clear(): void

  /**
   * Gets metadata value by key.
   */
  getMetadata(key: string): any | undefined

  /**
   * Sets metadata value by key.
   */
  setMetadata(key: string, value: any): void

  // Methods inherited from BaseHolderManager
  /**
   * Filters holders based on a predicate function.
   */
  filter(
    predicate: (
      value: InstanceHolder<any>,
      key: string,
    ) => boolean,
  ): Map<string, InstanceHolder>

  /**
   * Deletes a holder by name.
   */
  delete(name: string): boolean

  /**
   * Gets the number of holders currently managed.
   */
  size(): number

  /**
   * Checks if this manager has any holders.
   */
  isEmpty(): boolean

  /**
   * Registers a holder's dependencies in the reverse index.
   */
  registerDependencies(holderName: string, deps: Set<string>): void

  /**
   * Gets all holder names that depend on the given instance name.
   * O(1) lookup using the reverse dependency index.
   */
  getDependents(instanceName: string): string[]
}

/** @deprecated Use RequestContext instead */
export type RequestContextHolder = RequestContext

/**
 * Default implementation of RequestContext.
 *
 * Extends BaseHolderManager to provide holder management functionality
 * with request-specific metadata and lifecycle support.
 */
export class DefaultRequestContext
  extends BaseHolderManager
  implements RequestContext
{
  public readonly metadata = new Map<string, any>()
  public readonly createdAt = Date.now()

  constructor(
    public readonly requestId: string,
    public readonly priority: number = 100,
    initialMetadata?: Record<string, any>,
  ) {
    super(null) // RequestContext doesn't need logging
    if (initialMetadata) {
      Object.entries(initialMetadata).forEach(([key, value]) => {
        this.metadata.set(key, value)
      })
    }
  }

  /**
   * Public getter for holders to maintain interface compatibility.
   */
  get holders(): Map<string, InstanceHolder> {
    return this._holders
  }

  /**
   * Gets a holder by name. For RequestContext, this is a simple lookup.
   */
  get(name: string): InstanceHolder | undefined {
    return this._holders.get(name)
  }

  /**
   * Sets a holder by name.
   */
  set(name: string, holder: InstanceHolder): void {
    this._holders.set(name, holder)
  }

  /**
   * Checks if a holder exists by name.
   */
  has(name: string): boolean {
    return this._holders.has(name)
  }

  addInstance(
    instanceName: string | InjectionToken<any, undefined>,
    instance: any,
    holder?: InstanceHolder,
  ): void {
    if (instanceName instanceof InjectionToken) {
      const name = instanceName.toString()
      const createdHolder = this.createCreatedHolder(
        name,
        instance,
        InjectableType.Class,
        InjectableScope.Singleton,
        new Set(),
      )
      this._holders.set(name, createdHolder)
    } else {
      if (!holder) {
        throw new Error('Holder is required when adding an instance by name')
      }
      this._holders.set(instanceName, holder)
    }
  }

  clear(): void {
    super.clear() // Use the base class clear method for holders
    this.metadata.clear()
  }

  getMetadata(key: string): any | undefined {
    return this.metadata.get(key)
  }

  setMetadata(key: string, value: any): void {
    this.metadata.set(key, value)
  }
}

/**
 * Creates a new request context with the given parameters.
 */
export function createRequestContext(
  requestId: string,
  priority: number = 100,
  initialMetadata?: Record<string, any>,
): RequestContext {
  return new DefaultRequestContext(requestId, priority, initialMetadata)
}
