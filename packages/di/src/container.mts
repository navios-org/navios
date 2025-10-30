import type { z, ZodType } from 'zod/v4'

import type {
  BoundInjectionToken,
  ClassType,
  FactoryInjectionToken,
  InjectionToken,
  InjectionTokenSchemaType,
} from './injection-token.mjs'
import type { Factorable } from './interfaces/factory.interface.mjs'
import type { Registry } from './registry.mjs'
import type { RequestContextHolder } from './request-context-holder.mjs'
import type { ServiceLocatorInstanceHolder } from './service-locator-instance-holder.mjs'
import type { Injectors } from './utils/index.mjs'
import type { Join, UnionToArray } from './utils/types.mjs'

import { Injectable } from './decorators/injectable.decorator.mjs'
import { InjectableScope, InjectableType } from './enums/index.mjs'
import { defaultInjectors } from './injector.mjs'
import { globalRegistry } from './registry.mjs'
import { ServiceLocator } from './service-locator.mjs'
import { getInjectableToken } from './utils/get-injectable-token.mjs'

/**
 * Container class that provides a simplified public API for dependency injection.
 * It wraps a ServiceLocator instance and provides convenient methods for getting instances.
 */
@Injectable()
export class Container {
  private readonly serviceLocator: ServiceLocator

  constructor(
    protected readonly registry: Registry = globalRegistry,
    protected readonly logger: Console | null = null,
    protected readonly injectors: Injectors = defaultInjectors,
  ) {
    this.serviceLocator = new ServiceLocator(registry, logger, injectors)
    this.registerSelf()
  }

  private registerSelf() {
    const token = getInjectableToken(Container)
    const instanceName = this.serviceLocator.getInstanceIdentifier(token)
    this.serviceLocator
      .getManager()
      .storeCreatedHolder(
        instanceName,
        this,
        InjectableType.Class,
        InjectableScope.Singleton,
      )
  }

  /**
   * Gets an instance from the container.
   * This method has the same type signature as the inject method from get-injectors.mts
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
  ) {
    return this.serviceLocator.getOrThrowInstance(token, args as any)
  }

  /**
   * Gets the underlying ServiceLocator instance for advanced usage
   */
  getServiceLocator(): ServiceLocator {
    return this.serviceLocator
  }

  /**
   * Invalidates a service and its dependencies
   */
  async invalidate(service: unknown): Promise<void> {
    const holder = this.getHolderByInstance(service)
    if (holder) {
      await this.serviceLocator.invalidate(holder.name)
    } else {
      const requestHolder = this.getRequestHolderByInstance(service)
      if (requestHolder) {
        await this.serviceLocator.invalidate(requestHolder.name)
      }
    }
  }

  /**
   * Gets a service holder by instance (reverse lookup)
   */
  private getHolderByInstance(
    instance: unknown,
  ): ServiceLocatorInstanceHolder | null {
    const holderMap = Array.from(
      this.serviceLocator
        .getManager()
        .filter((holder) => holder.instance === instance)
        .values(),
    )

    return holderMap.length > 0 ? holderMap[0] : null
  }

  private getRequestHolderByInstance(
    instance: unknown,
  ): ServiceLocatorInstanceHolder | null {
    const requestContexts = this.serviceLocator
      .getRequestContextManager()
      .getRequestContexts()
    if (requestContexts) {
      for (const requestContext of requestContexts.values()) {
        for (const holder of requestContext.holders.values()) {
          if (holder.instance === instance) {
            return holder
          }
        }
      }
    }
    return null
  }

  /**
   * Checks if a service is registered in the container
   */
  isRegistered(token: any): boolean {
    try {
      return this.serviceLocator.getInstanceIdentifier(token) !== null
    } catch {
      return false
    }
  }

  /**
   * Disposes the container and cleans up all resources
   */
  async dispose(): Promise<void> {
    await this.serviceLocator.clearAll()
  }

  /**
   * Waits for all pending operations to complete
   */
  async ready(): Promise<void> {
    await this.serviceLocator.ready()
  }

  // ============================================================================
  // REQUEST CONTEXT MANAGEMENT
  // ============================================================================

  /**
   * Begins a new request context with the given parameters.
   * @param requestId Unique identifier for this request
   * @param metadata Optional metadata for the request
   * @param priority Priority for resolution (higher = more priority)
   * @returns The created request context holder
   */
  beginRequest(
    requestId: string,
    metadata?: Record<string, any>,
    priority: number = 100,
  ): RequestContextHolder {
    return this.serviceLocator.beginRequest(requestId, metadata, priority)
  }

  /**
   * Ends a request context and cleans up all associated instances.
   * @param requestId The request ID to end
   */
  async endRequest(requestId: string): Promise<void> {
    await this.serviceLocator.endRequest(requestId)
  }

  /**
   * Gets the current request context.
   * @returns The current request context holder or null
   */
  getCurrentRequestContext(): RequestContextHolder | null {
    return this.serviceLocator.getCurrentRequestContext()
  }

  /**
   * Sets the current request context.
   * @param requestId The request ID to set as current
   */
  setCurrentRequestContext(requestId: string): void {
    this.serviceLocator.setCurrentRequestContext(requestId)
  }

  /**
   * Clears all instances and bindings from the container.
   * This is useful for testing or resetting the container state.
   */
  clear(): Promise<void> {
    return this.serviceLocator.clearAll()
  }
}
