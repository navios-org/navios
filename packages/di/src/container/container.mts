import type { z, ZodType } from 'zod/v4'

import type {
  ClassType,
  ClassTypeWithArgument,
  InjectionToken,
  InjectionTokenSchemaType,
} from '../token/injection-token.mjs'
import type { IContainer } from '../interfaces/container.interface.mjs'
import type { Factorable } from '../interfaces/factory.interface.mjs'
import type { Registry } from '../token/registry.mjs'
import type { InstanceHolder } from '../internal/holder/instance-holder.mjs'
import type { Injectors } from '../utils/index.mjs'
import type { Join, UnionToArray } from '../utils/types.mjs'

import { Injectable } from '../decorators/injectable.decorator.mjs'
import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { DIError } from '../errors/index.mjs'
import {
  BoundInjectionToken,
  FactoryInjectionToken,
} from '../token/injection-token.mjs'
import { defaultInjectors } from '../injectors.mjs'
import { globalRegistry } from '../token/registry.mjs'
import { ScopedContainer } from './scoped-container.mjs'
import { ServiceLocator } from '../internal/core/service-locator.mjs'
import { getInjectableToken } from '../utils/get-injectable-token.mjs'

/**
 * Main dependency injection container.
 *
 * Provides a simplified public API for dependency injection, wrapping
 * a ServiceLocator instance. Handles singleton and transient services directly,
 * while request-scoped services require using beginRequest() to create a ScopedContainer.
 */
@Injectable()
export class Container implements IContainer {
  private readonly serviceLocator: ServiceLocator
  private readonly activeRequestIds = new Set<string>()

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
   *
   * NOTE: Request-scoped services cannot be resolved directly from Container.
   * Use beginRequest() to create a ScopedContainer for request-scoped services.
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
    // Check if this is a request-scoped service
    // Use TokenProcessor for consistent token normalization
    const tokenProcessor = this.serviceLocator.getTokenProcessor()
    const realToken = tokenProcessor.getRegistryToken(token)

    if (this.registry.has(realToken)) {
      const record = this.registry.get(realToken)
      if (record.scope === InjectableScope.Request) {
        throw DIError.unknown(
          `Cannot resolve request-scoped service "${String(realToken.name)}" from Container. ` +
            `Use beginRequest() to create a ScopedContainer for request-scoped services.`,
        )
      }
    }

    return this.serviceLocator.getOrThrowInstance(token, args as any, this)
  }

  /**
   * Gets an instance with a specific container context.
   * Used by ScopedContainer to delegate singleton/transient resolution
   * while maintaining the correct container context for nested inject() calls.
   *
   * @internal
   */
  async getWithContext(
    token:
      | ClassType
      | InjectionToken<any>
      | BoundInjectionToken<any, any>
      | FactoryInjectionToken<any, any>,
    args: unknown,
    contextContainer: IContainer,
  ): Promise<any> {
    return this.serviceLocator.getOrThrowInstance(
      token,
      args as any,
      contextContainer,
    )
  }

  /**
   * Resolves a request-scoped service for a ScopedContainer.
   * The service will be stored in the ScopedContainer's request context.
   *
   * @internal
   */
  async resolveForRequest(
    token:
      | ClassType
      | InjectionToken<any>
      | BoundInjectionToken<any, any>
      | FactoryInjectionToken<any, any>,
    args: unknown,
    scopedContainer: ScopedContainer,
  ): Promise<any> {
    return this.serviceLocator.resolveRequestScoped(
      token,
      args as any,
      scopedContainer,
    )
  }

  /**
   * Gets the underlying ServiceLocator instance for advanced usage
   */
  getServiceLocator(): ServiceLocator {
    return this.serviceLocator
  }

  /**
   * Gets the registry
   */
  getRegistry(): Registry {
    return this.registry
  }

  /**
   * Invalidates a service and its dependencies
   */
  async invalidate(service: unknown): Promise<void> {
    const holder = this.getHolderByInstance(service)
    if (holder) {
      await this.serviceLocator.invalidate(holder.name)
    }
  }

  /**
   * Gets a service holder by instance (reverse lookup)
   */
  private getHolderByInstance(
    instance: unknown,
  ): InstanceHolder | null {
    const holderMap = Array.from(
      this.serviceLocator
        .getManager()
        .filter((holder) => holder.instance === instance)
        .values(),
    )

    return holderMap.length > 0 ? holderMap[0] : null
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

  /**
   * @internal
   * Attempts to get an instance synchronously if it already exists.
   * Returns null if the instance doesn't exist or is not ready.
   */
  tryGetSync<T>(token: any, args?: any): T | null {
    return this.serviceLocator.getSyncInstance(token, args, this)
  }

  // ============================================================================
  // REQUEST CONTEXT MANAGEMENT
  // ============================================================================

  /**
   * Begins a new request context and returns a ScopedContainer.
   *
   * The ScopedContainer provides isolated request-scoped service resolution
   * while delegating singleton and transient services to this Container.
   *
   * @param requestId Unique identifier for this request
   * @param metadata Optional metadata for the request
   * @param priority Priority for resolution (higher = more priority)
   * @returns A ScopedContainer for this request
   */
  beginRequest(
    requestId: string,
    metadata?: Record<string, any>,
    priority: number = 100,
  ): ScopedContainer {
    if (this.activeRequestIds.has(requestId)) {
      throw DIError.unknown(
        `Request context "${requestId}" already exists. Use a unique request ID.`,
      )
    }

    this.activeRequestIds.add(requestId)

    this.logger?.log(`[Container] Started request context: ${requestId}`)

    return new ScopedContainer(
      this,
      this.registry,
      requestId,
      metadata,
      priority,
    )
  }

  /**
   * Removes a request ID from the active set.
   * Called by ScopedContainer when the request ends.
   *
   * @internal
   */
  removeActiveRequest(requestId: string): void {
    this.activeRequestIds.delete(requestId)
    this.logger?.log(`[Container] Ended request context: ${requestId}`)
  }

  /**
   * Gets the set of active request IDs.
   */
  getActiveRequestIds(): ReadonlySet<string> {
    return this.activeRequestIds
  }

  /**
   * Checks if a request ID is currently active.
   */
  hasActiveRequest(requestId: string): boolean {
    return this.activeRequestIds.has(requestId)
  }

  /**
   * Clears all instances and bindings from the container.
   * This is useful for testing or resetting the container state.
   */
  clear(): Promise<void> {
    return this.serviceLocator.clearAll()
  }
}
