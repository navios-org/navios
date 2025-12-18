import type { z, ZodType } from 'zod/v4'

import type { Container } from './container.mjs'
import type {
  BoundInjectionToken,
  ClassType,
  ClassTypeWithArgument,
  FactoryInjectionToken,
  InjectionToken,
  InjectionTokenSchemaType,
} from './injection-token.mjs'
import type { IContainer } from './interfaces/container.interface.mjs'
import type { IHolderStorage } from './interfaces/holder-storage.interface.mjs'
import type { Factorable } from './interfaces/factory.interface.mjs'
import type { Registry } from './registry.mjs'
import type { RequestContextHolder } from './request-context-holder.mjs'
import type { ServiceLocatorInstanceHolder } from './service-locator-instance-holder.mjs'
import type { Join, UnionToArray } from './utils/types.mjs'

import { BaseInstanceHolderManager } from './base-instance-holder-manager.mjs'
import { InjectableScope } from './enums/index.mjs'
import { DIError } from './errors/index.mjs'
import { DefaultRequestContextHolder } from './request-context-holder.mjs'
import { RequestHolderStorage } from './request-holder-storage.mjs'
import { ServiceLocatorInstanceHolderStatus } from './service-locator-instance-holder.mjs'

/**
 * ScopedContainer provides request-scoped dependency injection.
 *
 * It wraps a parent Container and provides isolated request-scoped instances
 * while delegating singleton and transient resolution to the parent.
 *
 * This design eliminates race conditions that can occur with async operations
 * when multiple requests are processed concurrently.
 */
export class ScopedContainer implements IContainer {
  private readonly requestContextHolder: RequestContextHolder
  private readonly holderStorage: IHolderStorage
  private disposed = false

  constructor(
    private readonly parent: Container,
    private readonly registry: Registry,
    public readonly requestId: string,
    metadata?: Record<string, any>,
    priority: number = 100,
  ) {
    this.requestContextHolder = new DefaultRequestContextHolder(
      requestId,
      priority,
      metadata,
    )
    // Create storage once and reuse for all resolutions
    this.holderStorage = new RequestHolderStorage(
      this.requestContextHolder,
      this.parent.getServiceLocator().getManager(),
    )
  }

  /**
   * Gets the request context holder for this scoped container.
   */
  getRequestContextHolder(): RequestContextHolder {
    return this.requestContextHolder
  }

  /**
   * Gets the holder storage for this scoped container.
   * Used by InstanceResolver for request-scoped resolution.
   */
  getHolderStorage(): IHolderStorage {
    return this.holderStorage
  }

  /**
   * Gets the request ID for this scoped container.
   */
  getRequestId(): string {
    return this.requestId
  }

  /**
   * Gets the parent container.
   */
  getParent(): Container {
    return this.parent
  }

  /**
   * Gets metadata from the request context.
   */
  getMetadata(key: string): any | undefined {
    return this.requestContextHolder.getMetadata(key)
  }

  /**
   * Sets metadata on the request context.
   */
  setMetadata(key: string, value: any): void {
    this.requestContextHolder.setMetadata(key, value)
  }

  /**
   * Adds a pre-prepared instance to the request context.
   */
  addInstance(token: InjectionToken<any, undefined>, instance: any): void {
    this.requestContextHolder.addInstance(token, instance)
  }

  /**
   * Gets an instance from the container.
   * Request-scoped services are resolved from this container's context.
   * All other services are delegated to the parent container.
   */
  // #1 Simple class
  get<T extends ClassType>(
    token: T,
  ): InstanceType<T> extends Factorable<infer R>
    ? Promise<R>
    : Promise<InstanceType<T>>
  // #1.1 Simple class with args
  get<T extends ClassTypeWithArgument<R>, R>(
    token: T,
    args: R,
  ): Promise<InstanceType<T>>
  // #2 Token with required Schema
  get<T, S extends InjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    args: z.input<S>,
  ): Promise<T>
  // #3 Token with optional Schema
  get<T, S extends InjectionTokenSchemaType, R extends boolean>(
    token: InjectionToken<T, S, R>,
  ): R extends false
    ? Promise<T>
    : S extends ZodType<infer Type>
      ? `Error: Your token requires args: ${Join<
          UnionToArray<keyof Type>,
          ', '
        >}`
      : 'Error: Your token requires args'
  // #4 Token with no Schema
  get<T>(token: InjectionToken<T, undefined>): Promise<T>
  get<T>(token: BoundInjectionToken<T, any>): Promise<T>
  get<T>(token: FactoryInjectionToken<T, any>): Promise<T>

  async get(
    token:
      | ClassType
      | InjectionToken<any>
      | BoundInjectionToken<any, any>
      | FactoryInjectionToken<any, any>,
    args?: unknown,
  ): Promise<any> {
    if (this.disposed) {
      throw DIError.unknown(
        `ScopedContainer for request ${this.requestId} has been disposed`,
      )
    }

    // Get the actual injection token using TokenProcessor for consistency
    const tokenProcessor = this.parent.getServiceLocator().getTokenProcessor()
    const actualToken = tokenProcessor.normalizeToken(token)

    // Check if this is a request-scoped service
    if (this.isRequestScoped(actualToken)) {
      return this.resolveRequestScoped(actualToken, args)
    }

    // Delegate to parent for singleton/transient services
    // Pass this ScopedContainer so nested inject() calls work correctly
    return this.parent.getWithContext(token, args, this)
  }

  /**
   * Invalidates a service and its dependencies.
   * For request-scoped services, invalidation is handled within this context.
   */
  async invalidate(service: unknown): Promise<void> {
    // Check if the service is in our request context
    const holder = this.holderStorage.findByInstance(service)
    if (holder) {
      // Use the shared ServiceInvalidator with our request-scoped storage
      await this.parent
        .getServiceLocator()
        .getServiceInvalidator()
        .invalidateWithStorage(holder.name, this.holderStorage, 1, {
          emitEvents: false, // Request-scoped services don't emit global events
        })
      return
    }

    // Delegate to parent for singleton services
    await this.parent.invalidate(service)
  }

  /**
   * Checks if a service is registered.
   */
  isRegistered(token: any): boolean {
    return this.parent.isRegistered(token)
  }

  /**
   * Disposes this scoped container and cleans up all request-scoped instances.
   * This is an alias for endRequest() for IContainer compatibility.
   */
  async dispose(): Promise<void> {
    await this.endRequest()
  }

  /**
   * Ends the request and cleans up all request-scoped instances.
   * Uses the invalidation system to properly cascade to dependent singletons.
   */
  async endRequest(): Promise<void> {
    if (this.disposed) {
      return
    }

    this.disposed = true

    // Use clearAllWithStorage to properly invalidate all request-scoped services
    // This will cascade invalidation to singletons that depend on request-scoped services
    await this.parent
      .getServiceLocator()
      .getServiceInvalidator()
      .clearAllWithStorage(this.holderStorage, {
        waitForSettlement: true,
        maxRounds: 10,
      })

    // Clear the context (any remaining holders that weren't invalidated)
    this.requestContextHolder.clear()

    // Remove from parent's active requests
    this.parent.removeActiveRequest(this.requestId)
  }

  /**
   * Waits for all pending operations to complete.
   */
  async ready(): Promise<void> {
    await this.parent.ready()
  }

  /**
   * @internal
   * Attempts to get an instance synchronously if it already exists and is ready.
   * For request-scoped services, checks this container's context first.
   * For other services, delegates to the parent container.
   *
   * Returns null if the instance doesn't exist or is not yet ready (still creating).
   */
  tryGetSync<T>(token: any, args?: any): T | null {
    const tokenProcessor = this.parent.getServiceLocator().getTokenProcessor()
    const actualToken = tokenProcessor.normalizeToken(token)

    // Check if this is a request-scoped service
    if (this.isRequestScoped(actualToken)) {
      const serviceLocator = this.parent.getServiceLocator()
      const instanceName = serviceLocator.getInstanceIdentifier(token, args)
      const holder = this.requestContextHolder.get(instanceName)
      // Only return if holder exists AND is in Created status
      if (
        holder &&
        holder.status === ServiceLocatorInstanceHolderStatus.Created
      ) {
        return holder.instance as T
      }
      return null
    }

    // Delegate to parent for non-request-scoped
    return this.parent.tryGetSync(token, args)
  }

  /**
   * Checks if a token is for a request-scoped service.
   */
  private isRequestScoped(token: any): boolean {
    // Handle BoundInjectionToken and FactoryInjectionToken using TokenProcessor
    const tokenProcessor = this.parent.getServiceLocator().getTokenProcessor()
    const realToken = tokenProcessor.getRealToken(token)

    if (!this.registry.has(realToken)) {
      return false
    }

    const record = this.registry.get(realToken)
    return record.scope === InjectableScope.Request
  }

  /**
   * Resolves a request-scoped service from this container's context.
   * Uses locking to prevent duplicate initialization during concurrent resolution.
   */
  private async resolveRequestScoped(token: any, args: unknown): Promise<any> {
    // Get the instance name
    const serviceLocator = this.parent.getServiceLocator()
    const instanceName = serviceLocator.getInstanceIdentifier(token, args)

    // Check if we already have this instance (or one is being created)
    const existingHolder = this.requestContextHolder.get(instanceName)
    if (existingHolder) {
      // Wait for the holder to be ready if it's still being created
      // This prevents race conditions where multiple concurrent calls
      // might try to create the same service
      const [error, readyHolder] =
        await BaseInstanceHolderManager.waitForHolderReady(existingHolder)
      if (error) {
        throw error
      }
      return readyHolder.instance
    }

    // Create new instance using parent's resolution mechanism
    // but store it in our request context
    return this.parent.resolveForRequest(token, args, this)
  }

  /**
   * Stores an instance in the request context.
   * Called by Container during request-scoped service resolution.
   */
  storeRequestInstance(
    instanceName: string,
    instance: any,
    holder: ServiceLocatorInstanceHolder,
  ): void {
    this.requestContextHolder.addInstance(instanceName, instance, holder)
  }

  /**
   * Gets an existing instance from the request context.
   * Called by Container during resolution to check for existing instances.
   */
  getRequestInstance(
    instanceName: string,
  ): ServiceLocatorInstanceHolder | undefined {
    return this.requestContextHolder.get(instanceName)
  }

  /**
   * Generates a prefixed event name for request-scoped services.
   * Format: {requestId}:{instanceName}
   */
  getPrefixedEventName(instanceName: string): string {
    return `${this.requestId}:${instanceName}`
  }
}
