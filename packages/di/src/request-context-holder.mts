import type { ServiceLocatorInstanceHolder } from './service-locator-instance-holder.mjs'

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
   * Pre-prepared instances for this request, keyed by instance name.
   */
  readonly instances: Map<string, any>

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
   * Gets a pre-prepared instance from this context.
   */
  getInstance(instanceName: string): any | undefined

  /**
   * Gets an instance holder from this context.
   */
  getHolder(instanceName: string): ServiceLocatorInstanceHolder | undefined

  /**
   * Checks if this context has a pre-prepared instance.
   */
  hasInstance(instanceName: string): boolean

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
}

/**
 * Default implementation of RequestContextHolder.
 */
export class DefaultRequestContextHolder implements RequestContextHolder {
  public readonly instances = new Map<string, any>()
  public readonly holders = new Map<string, ServiceLocatorInstanceHolder>()
  public readonly metadata = new Map<string, any>()
  public readonly createdAt = Date.now()

  constructor(
    public readonly requestId: string,
    public readonly priority: number = 100,
    initialMetadata?: Record<string, any>,
  ) {
    if (initialMetadata) {
      Object.entries(initialMetadata).forEach(([key, value]) => {
        this.metadata.set(key, value)
      })
    }
  }

  addInstance(
    instanceName: string,
    instance: any,
    holder: ServiceLocatorInstanceHolder,
  ): void {
    this.instances.set(instanceName, instance)
    this.holders.set(instanceName, holder)
  }

  getInstance(instanceName: string): any | undefined {
    return this.instances.get(instanceName)
  }

  getHolder(instanceName: string): ServiceLocatorInstanceHolder | undefined {
    return this.holders.get(instanceName)
  }

  hasInstance(instanceName: string): boolean {
    return this.instances.has(instanceName)
  }

  clear(): void {
    this.instances.clear()
    this.holders.clear()
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
