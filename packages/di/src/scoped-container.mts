import type { z, ZodType } from 'zod/v4'

import type { IContainer } from './interfaces/container.interface.mjs'
import type {
  BoundInjectionToken,
  ClassType,
  FactoryInjectionToken,
  InjectionToken,
  InjectionTokenSchemaType,
} from './injection-token.mjs'
import type { Factorable } from './interfaces/factory.interface.mjs'
import type { Registry } from './registry.mjs'
import type { ServiceLocatorInstanceHolder } from './service-locator-instance-holder.mjs'
import type { Join, UnionToArray } from './utils/types.mjs'

import type { Container } from './container.mjs'

import { InjectableScope } from './enums/index.mjs'
import { DIError } from './errors/index.mjs'
import {
  DefaultRequestContextHolder,
  type RequestContextHolder,
} from './request-context-holder.mjs'
import { getInjectableToken } from './utils/get-injectable-token.mjs'

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
  }

  /**
   * Gets the request context holder for this scoped container.
   */
  getRequestContextHolder(): RequestContextHolder {
    return this.requestContextHolder
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

    // Get the actual injection token
    const actualToken =
      typeof token === 'function' ? getInjectableToken(token) : token

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
    const holder = this.getRequestHolderByInstance(service)
    if (holder) {
      await this.invalidateRequestScoped(holder.name)
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
   */
  async endRequest(): Promise<void> {
    if (this.disposed) {
      return
    }

    this.disposed = true

    // Clean up all request-scoped instances
    const cleanupPromises: Promise<any>[] = []
    for (const [, holder] of this.requestContextHolder.holders) {
      if (holder.destroyListeners.length > 0) {
        cleanupPromises.push(
          Promise.all(holder.destroyListeners.map((listener) => listener())),
        )
      }
    }

    await Promise.all(cleanupPromises)

    // Clear the context
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
   * Attempts to get an instance synchronously if it already exists.
   * For request-scoped services, checks this container's context first.
   * For other services, delegates to the parent container.
   */
  tryGetSync<T>(token: any, args?: any): T | null {
    const actualToken =
      typeof token === 'function' ? getInjectableToken(token) : token

    // Check if this is a request-scoped service
    if (this.isRequestScoped(actualToken)) {
      const serviceLocator = this.parent.getServiceLocator()
      const instanceName = serviceLocator.getInstanceIdentifier(token, args)
      const holder = this.requestContextHolder.get(instanceName)
      if (holder) {
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
    // Handle BoundInjectionToken and FactoryInjectionToken
    const realToken = token.token ?? token

    if (!this.registry.has(realToken)) {
      return false
    }

    const record = this.registry.get(realToken)
    return record.scope === InjectableScope.Request
  }

  /**
   * Resolves a request-scoped service from this container's context.
   */
  private async resolveRequestScoped(token: any, args: unknown): Promise<any> {
    // Get the instance name
    const serviceLocator = this.parent.getServiceLocator()
    const instanceName = serviceLocator.getInstanceIdentifier(token, args)

    // Check if we already have this instance
    const existingHolder = this.requestContextHolder.get(instanceName)
    if (existingHolder) {
      return existingHolder.instance
    }

    // Create new instance using parent's resolution mechanism
    // but store it in our request context
    return this.parent.resolveForRequest(token, args, this)
  }

  /**
   * Invalidates a request-scoped service by name.
   * This also invalidates all services that depend on it (cascade invalidation).
   */
  private async invalidateRequestScoped(instanceName: string): Promise<void> {
    const holder = this.requestContextHolder.get(instanceName)
    if (!holder) {
      return
    }

    // Find all services that depend on this one and invalidate them first
    const dependents = this.findDependents(instanceName)
    for (const dependentName of dependents) {
      await this.invalidateRequestScoped(dependentName)
    }

    // Call destroy listeners
    if (holder.destroyListeners.length > 0) {
      await Promise.all(holder.destroyListeners.map((listener) => listener()))
    }

    // Remove from context
    this.requestContextHolder.delete(instanceName)
  }

  /**
   * Finds all services that depend on the given service.
   */
  private findDependents(instanceName: string): string[] {
    const dependents: string[] = []
    for (const [name, holder] of this.requestContextHolder.holders) {
      if (holder.deps.has(instanceName)) {
        dependents.push(name)
      }
    }
    return dependents
  }

  /**
   * Gets a request holder by instance (reverse lookup).
   */
  private getRequestHolderByInstance(
    instance: unknown,
  ): ServiceLocatorInstanceHolder | null {
    for (const holder of this.requestContextHolder.holders.values()) {
      if (holder.instance === instance) {
        return holder
      }
    }
    return null
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
  getRequestInstance(instanceName: string): ServiceLocatorInstanceHolder | undefined {
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
