import type { ServiceLocatorInstanceHolder } from './service-locator-instance-holder.mjs'

import { BaseInstanceHolderManager } from './base-instance-holder-manager.mjs'
import { InjectableScope, InjectableType } from './enums/index.mjs'
import { InjectionToken } from './injection-token.mjs'

/**
 * Request context holder that manages pre-prepared instances for a specific request.
 * This allows for efficient instantiation of request-scoped services.
 */
export interface RequestContextHolder {
  /**
   * Unique identifier for this request context.
   */
  readonly requestId: string

  /**
   * Instance holders for request-scoped services.
   */
  readonly holders: Map<string, ServiceLocatorInstanceHolder>

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
    holder: ServiceLocatorInstanceHolder,
  ): void

  /**
   * Adds a pre-prepared instance to this context.
   */
  addInstance(token: InjectionToken<any, undefined>, instance: any): void

  /**
   * Gets an instance holder from this context.
   */
  get(instanceName: string): ServiceLocatorInstanceHolder | undefined

  /**
   * Sets an instance holder by name.
   */
  set(instanceName: string, holder: ServiceLocatorInstanceHolder): void

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

  // Methods inherited from BaseInstanceHolderManager
  /**
   * Filters holders based on a predicate function.
   */
  filter(
    predicate: (
      value: ServiceLocatorInstanceHolder<any>,
      key: string,
    ) => boolean,
  ): Map<string, ServiceLocatorInstanceHolder>

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
}

/**
 * Default implementation of RequestContextHolder.
 */
export class DefaultRequestContextHolder
  extends BaseInstanceHolderManager
  implements RequestContextHolder
{
  public readonly metadata = new Map<string, any>()
  public readonly createdAt = Date.now()

  constructor(
    public readonly requestId: string,
    public readonly priority: number = 100,
    initialMetadata?: Record<string, any>,
  ) {
    super(null) // RequestContextHolder doesn't need logging
    if (initialMetadata) {
      Object.entries(initialMetadata).forEach(([key, value]) => {
        this.metadata.set(key, value)
      })
    }
  }

  /**
   * Public getter for holders to maintain interface compatibility.
   */
  get holders(): Map<string, ServiceLocatorInstanceHolder> {
    return this._holders
  }

  /**
   * Gets a holder by name. For RequestContextHolder, this is a simple lookup.
   */
  get(name: string): ServiceLocatorInstanceHolder | undefined {
    return this._holders.get(name)
  }

  /**
   * Sets a holder by name.
   */
  set(name: string, holder: ServiceLocatorInstanceHolder): void {
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
    holder?: ServiceLocatorInstanceHolder,
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
 * Creates a new request context holder with the given parameters.
 */
export function createRequestContextHolder(
  requestId: string,
  priority: number = 100,
  initialMetadata?: Record<string, any>,
): RequestContextHolder {
  return new DefaultRequestContextHolder(requestId, priority, initialMetadata)
}
