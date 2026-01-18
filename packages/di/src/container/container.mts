import type { z, ZodType } from 'zod/v4'

import { Injectable } from '../decorators/injectable.decorator.mjs'
import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { DIError } from '../errors/index.mjs'
import { InstanceResolver } from '../internal/core/instance-resolver.mjs'
import { NameResolver } from '../internal/core/name-resolver.mjs'
import { ScopeTracker } from '../internal/core/scope-tracker.mjs'
import { ServiceInitializer } from '../internal/core/service-initializer.mjs'
import { ServiceInvalidator } from '../internal/core/service-invalidator.mjs'
import { TokenResolver } from '../internal/core/token-resolver.mjs'
import { UnifiedStorage } from '../internal/holder/unified-storage.mjs'
import { LifecycleEventBus } from '../internal/lifecycle/lifecycle-event-bus.mjs'
import {
  BoundInjectionToken,
  FactoryInjectionToken,
  InjectionToken,
} from '../token/injection-token.mjs'
import { globalRegistry } from '../token/registry.mjs'
import { defaultInjectors } from '../utils/default-injectors.mjs'
import { getInjectableToken } from '../utils/index.mjs'

import type { Factorable } from '../interfaces/factory.interface.mjs'
import type {
  ClassType,
  ClassTypeWithArgument,
  InjectionTokenSchemaType,
} from '../token/injection-token.mjs'
import type { Registry } from '../token/registry.mjs'
import type { Injectors } from '../utils/get-injectors.mjs'
import type { Join, UnionToArray } from '../utils/types.mjs'

import { AbstractContainer } from './abstract-container.mjs'
import { ScopedContainer } from './scoped-container.mjs'

/**
 * Main dependency injection container.
 *
 * Provides a simplified public API for dependency injection.
 * Handles singleton and transient services directly,
 * while request-scoped services require using beginRequest() to create a ScopedContainer.
 */
@Injectable()
export class Container extends AbstractContainer {
  protected readonly defaultScope = InjectableScope.Singleton
  protected readonly requestId = undefined

  private readonly storage: UnifiedStorage
  private readonly serviceInitializer: ServiceInitializer
  private readonly serviceInvalidator: ServiceInvalidator
  private readonly tokenResolver: TokenResolver
  private readonly nameResolver: NameResolver
  private readonly scopeTracker: ScopeTracker
  private readonly eventBus: LifecycleEventBus
  private readonly instanceResolver: InstanceResolver
  private readonly activeRequestIds = new Set<string>()

  constructor(
    protected readonly registry: Registry = globalRegistry,
    protected readonly logger: Console | null = null,
    protected readonly injectors: Injectors = defaultInjectors,
  ) {
    super()
    // Initialize components
    this.storage = new UnifiedStorage(InjectableScope.Singleton)
    this.eventBus = new LifecycleEventBus(logger)
    this.nameResolver = new NameResolver(logger)
    this.tokenResolver = new TokenResolver(logger)
    this.scopeTracker = new ScopeTracker(registry, this.nameResolver, logger)
    this.serviceInitializer = new ServiceInitializer(injectors)
    this.serviceInvalidator = new ServiceInvalidator(this.eventBus, logger)
    this.instanceResolver = new InstanceResolver(
      registry,
      this.storage,
      this.serviceInitializer,
      this.tokenResolver,
      this.nameResolver,
      this.scopeTracker,
      this.serviceInvalidator,
      this.eventBus,
      logger,
    )
    this.registerSelf()
  }

  private registerSelf() {
    const token = getInjectableToken(Container)
    this.registry.set(token, InjectableScope.Singleton, Container, InjectableType.Class)
    const instanceName = this.nameResolver.generateInstanceName(
      token,
      undefined,
      undefined,
      InjectableScope.Singleton,
    )
    this.storage.storeInstance(instanceName, this)
  }

  /**
   * Gets an instance from the container.
   * NOTE: Request-scoped services cannot be resolved directly from Container.
   * Use beginRequest() to create a ScopedContainer for request-scoped services.
   */
  // #1 Simple class
  get<T extends ClassType>(
    token: T,
  ): InstanceType<T> extends Factorable<infer R> ? Promise<R> : Promise<InstanceType<T>>
  // #1.1 Simple class with args
  get<T extends ClassTypeWithArgument<R>, R>(token: T, args: R): Promise<InstanceType<T>>
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
      ? `Error: Your token requires args: ${Join<UnionToArray<keyof Type>, ', '>}`
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
    const realToken = this.tokenResolver.getRegistryToken(token)

    if (this.registry.has(realToken)) {
      const record = this.registry.get(realToken)
      if (record.scope === InjectableScope.Request) {
        throw DIError.scopeMismatchError(realToken.name, 'ScopedContainer', 'Container')
      }
    }

    const [error, instance] = await this.instanceResolver.resolveInstance(token, args, this)

    if (error) {
      throw error
    }

    return instance
  }

  /**
   * Invalidates a service and its dependencies.
   */
  async invalidate(service: unknown): Promise<void> {
    // Find the service by instance
    const holder = this.storage.findByInstance(service)
    if (!holder) {
      this.logger?.warn(`[Container] Service instance not found for invalidation`)
      return
    }

    await this.serviceInvalidator.invalidateWithStorage(holder.name, this.storage)
  }

  /**
   * Disposes the container and cleans up all resources.
   */
  async dispose(): Promise<void> {
    await this.serviceInvalidator.clearAllWithStorage(this.storage)
  }

  /**
   * @internal
   * Attempts to get an instance synchronously if it already exists.
   * Overrides base class to support requestId parameter for ScopedContainer compatibility.
   */
  override tryGetSync<T>(token: any, args?: any, requestId?: string): T | null {
    return this.tryGetSyncFromStorage(token, args, this.storage, requestId ?? this.requestId)
  }

  /**
   * Begins a new request context and returns a ScopedContainer.
   */
  beginRequest(requestId: string, metadata?: Record<string, any>): ScopedContainer {
    if (this.activeRequestIds.has(requestId)) {
      throw new Error(`Request with ID ${requestId} already exists`)
    }

    this.activeRequestIds.add(requestId)

    return new ScopedContainer(this, this.registry, requestId, metadata)
  }

  /**
   * Gets all active request IDs.
   */
  getActiveRequestIds(): ReadonlySet<string> {
    return this.activeRequestIds
  }

  /**
   * Checks if a request is active.
   */
  hasActiveRequest(requestId: string): boolean {
    return this.activeRequestIds.has(requestId)
  }

  /**
   * Removes a request ID from active requests.
   * Called by ScopedContainer when request ends.
   */
  removeRequestId(requestId: string): void {
    this.activeRequestIds.delete(requestId)
  }

  // ============================================================================
  // INTERNAL METHODS FOR COMPONENT ACCESS
  // ============================================================================

  getStorage(): UnifiedStorage {
    return this.storage
  }

  getServiceInitializer(): ServiceInitializer {
    return this.serviceInitializer
  }

  getServiceInvalidator(): ServiceInvalidator {
    return this.serviceInvalidator
  }

  getTokenResolver(): TokenResolver {
    return this.tokenResolver
  }

  getNameResolver(): NameResolver {
    return this.nameResolver
  }

  getScopeTracker(): ScopeTracker {
    return this.scopeTracker
  }

  getEventBus(): LifecycleEventBus {
    return this.eventBus
  }

  getRegistry(): Registry {
    return this.registry
  }

  getInstanceResolver(): InstanceResolver {
    return this.instanceResolver
  }
}
