import type { z, ZodType } from 'zod/v4'

import type { IContainer } from '../interfaces/container.interface.mjs'
import type { Factorable } from '../interfaces/factory.interface.mjs'
import type {
  BoundInjectionToken,
  ClassType,
  ClassTypeWithArgument,
  FactoryInjectionToken,
  InjectionToken,
  InjectionTokenSchemaType,
} from '../token/injection-token.mjs'
import type { Registry } from '../token/registry.mjs'
import type { Join, UnionToArray } from '../utils/types.mjs'

import { InjectableScope } from '../enums/index.mjs'
import { InstanceStatus } from '../internal/holder/instance-holder.mjs'
import { UnifiedStorage } from '../internal/holder/unified-storage.mjs'
import { Container } from './container.mjs'

/**
 * Request-scoped dependency injection container.
 *
 * Wraps a parent Container and provides isolated request-scoped instances
 * while delegating singleton and transient resolution to the parent.
 * This design eliminates race conditions that can occur with async operations
 * when multiple requests are processed concurrently.
 */
export class ScopedContainer implements IContainer {
  private readonly storage: UnifiedStorage
  private disposed = false
  private readonly metadata: Record<string, any>

  constructor(
    private readonly parent: Container,
    private readonly registry: Registry,
    public readonly requestId: string,
    metadata?: Record<string, any>,
  ) {
    // Create own unified storage for request-scoped services
    this.storage = new UnifiedStorage(InjectableScope.Request)
    this.metadata = metadata || {}
  }

  /**
   * Gets the storage for this scoped container.
   */
  getStorage(): UnifiedStorage {
    return this.storage
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
    return this.metadata[key]
  }

  /**
   * Sets metadata on the request context.
   */
  setMetadata(key: string, value: any): void {
    this.metadata[key] = value
  }

  /**
   * Gets an instance from the container.
   * Request-scoped services are resolved from this container's storage.
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
  ) {
    if (this.disposed) {
      throw new Error('ScopedContainer has been disposed')
    }

    // Check if this is a request-scoped service
    const tokenResolver = this.parent.getTokenResolver()
    const realToken = tokenResolver.getRegistryToken(token)

    if (this.registry.has(realToken)) {
      const record = this.registry.get(realToken)
      if (record.scope === InjectableScope.Request) {
        // Resolve request-scoped service from this container
        const [error, instance] = await this.parent
          .getInstanceResolver()
          .resolveRequestScopedInstance(token, args, this)

        if (error) {
          throw error
        }

        return instance
      }
    }

    // Delegate singleton/transient services to parent
    const [error, instance] = await this.parent
      .getInstanceResolver()
      .resolveInstance(token, args, this, this.storage, this.requestId)

    if (error) {
      throw error
    }

    return instance
  }

  /**
   * Invalidates a service and its dependencies.
   */
  async invalidate(service: unknown): Promise<void> {
    // Find the service by instance in request storage
    const holder = this.storage.findByInstance(service)
    if (!holder) {
      // Try parent storage
      return this.parent.invalidate(service)
    }

    await this.parent
      .getServiceInvalidator()
      .invalidateWithStorage(holder.name, this.storage)
  }

  /**
   * Checks if a service is registered in the container.
   */
  isRegistered(token: any): boolean {
    return this.parent.isRegistered(token)
  }

  /**
   * Disposes the container and cleans up all resources.
   * Alias for endRequest().
   */
  async dispose(): Promise<void> {
    return this.endRequest()
  }

  /**
   * Waits for all pending operations to complete.
   */
  async ready(): Promise<void> {
    await this.parent.getServiceInvalidator().readyWithStorage(this.storage)
  }

  /**
   * @internal
   * Attempts to get an instance synchronously if it already exists.
   */
  tryGetSync<T>(token: any, args?: any): T | null {
    // Check request storage first
    const tokenResolver = this.parent.getTokenResolver()
    const realToken = tokenResolver.getRegistryToken(token)
    const scope = this.registry.has(realToken)
      ? this.registry.get(realToken).scope
      : InjectableScope.Singleton

    if (scope === InjectableScope.Request) {
      const instanceName = this.parent
        .getNameResolver()
        .generateInstanceName(
          tokenResolver.normalizeToken(token),
          args,
          this.requestId,
          scope,
        )

      const result = this.storage.get(instanceName)
      if (result && result[0] === undefined && result[1]) {
        const holder = result[1]
        if (holder.status === InstanceStatus.Created) {
          return holder.instance as T
        }
      }
    }

    // Delegate to parent for singleton/transient
    return this.parent.tryGetSync<T>(token, args, this.requestId)
  }

  /**
   * Ends the request and cleans up all request-scoped services.
   */
  async endRequest(): Promise<void> {
    if (this.disposed) {
      return
    }

    this.disposed = true

    // Clear all request-scoped services
    await this.parent.getServiceInvalidator().clearAllWithStorage(this.storage)

    // Remove request ID from parent
    this.parent.removeRequestId(this.requestId)
  }
}
