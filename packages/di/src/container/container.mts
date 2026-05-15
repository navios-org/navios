import { Injectable } from '../decorators/injectable.decorator.mjs'
import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { DIError } from '../errors/index.mjs'
import { InstanceResolver } from '../internal/core/instance-resolver.mjs'
import { NameResolver } from '../internal/core/name-resolver.mjs'
import { ServiceInitializer } from '../internal/core/service-initializer.mjs'
import { ServiceInvalidator } from '../internal/core/service-invalidator.mjs'
import { TokenResolver } from '../internal/core/token-resolver.mjs'
import { UnifiedStorage } from '../internal/holder/unified-storage.mjs'
import { LifecycleEventBus } from '../internal/lifecycle/lifecycle-event-bus.mjs'
import { PluginRegistry } from '../plugin/index.mjs'
import {
  BoundToken,
  FactoryToken,
  Token,
} from '../token/token.mjs'
import { globalRegistry } from '../token/registry.mjs'
import { getInjectableToken } from '../utils/index.mjs'

import type { Factorable } from '../interfaces/factory.interface.mjs'
import type { Plugin } from '../plugin/index.mjs'
import type {
  ClassType,
  ClassTypeWithArgument,
  TokenSchemaType,
} from '../token/token.mjs'
import type { StandardSchemaV1 } from '../token/schema.mjs'
import type { Registry } from '../token/registry.mjs'
import type { TokenArgsRequiredError } from '../utils/types.mjs'

import { AbstractContainer } from './abstract-container.mjs'
import { ScopedContainer } from './scoped-container.mjs'

/**
 * Configuration options for {@link Container}.
 */
export interface ContainerOptions {
  /** Registry to resolve token records from. Defaults to {@link globalRegistry}. */
  registry?: Registry
  /** Optional logger used for diagnostics AND as the backing for plugin-error reporting. */
  logger?: Console | null
  /** Plugins registered at construction time, in registration order. */
  plugins?: Plugin[]
}

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

  protected readonly registry: Registry
  protected readonly logger: Console | null

  private readonly storage: UnifiedStorage
  private readonly serviceInitializer: ServiceInitializer
  private readonly serviceInvalidator: ServiceInvalidator
  private readonly tokenResolver: TokenResolver
  private readonly nameResolver: NameResolver
  private readonly eventBus: LifecycleEventBus
  private readonly instanceResolver: InstanceResolver
  private readonly pluginRegistry: PluginRegistry
  private readonly activeRequestIds = new Set<string>()

  constructor(options: ContainerOptions = {}) {
    super()
    const { registry = globalRegistry, logger = null, plugins = [] } = options
    this.registry = registry
    this.logger = logger
    // Plugin observer-hook errors are isolated by PluginRegistry; route the
    // report through the container logger when one was provided so plugin
    // authors get a signal on the same sink as the rest of the container
    // (carry-forward from the Task 4.1 review). When no logger is supplied we
    // pass NO handler so PluginRegistry's own guarded console.error default
    // applies — rather than duplicating that fallback here.
    this.pluginRegistry = new PluginRegistry(
      plugins,
      logger
        ? (error, plugin, phase) =>
            logger.error(
              `[navios/di] plugin "${plugin.name}" ${phase} hook failed`,
              error,
            )
        : undefined,
    )
    // Initialize components
    this.storage = new UnifiedStorage(InjectableScope.Singleton)
    this.eventBus = new LifecycleEventBus(logger)
    this.nameResolver = new NameResolver(logger)
    this.tokenResolver = new TokenResolver(logger)
    this.serviceInitializer = new ServiceInitializer(registry, this.tokenResolver)
    this.serviceInvalidator = new ServiceInvalidator(
      this.eventBus,
      this.pluginRegistry,
      logger,
    )
    this.instanceResolver = new InstanceResolver(
      registry,
      this.storage,
      this.serviceInitializer,
      this.tokenResolver,
      this.nameResolver,
      this.serviceInvalidator,
      this.eventBus,
      this.pluginRegistry,
      logger,
    )
    this.registerSelf()
  }

  /**
   * Registers a plugin after construction. Subsequently-created instances
   * (and, for transients, every resolution) observe it; already-cached
   * singletons are not retroactively wrapped.
   */
  use(plugin: Plugin): void {
    this.pluginRegistry.register(plugin)
  }

  /**
   * @internal
   * Exposes the container's PluginRegistry so a ScopedContainer can share
   * its parent's plugins rather than constructing a second registry.
   */
  getPluginRegistry(): PluginRegistry {
    return this.pluginRegistry
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
  get<T, S extends TokenSchemaType>(
    token: Token<T, S>,
    args: StandardSchemaV1.InferInput<S>,
  ): Promise<T>
  // #3 Token with schema resolved without args -> compile-time DX error
  get<T, S extends TokenSchemaType, R extends boolean>(
    token: Token<T, S, R>,
  ): R extends false ? Promise<T> : TokenArgsRequiredError<S>
  // #4 Token with no Schema
  get<T>(token: Token<T, undefined>): Promise<T>
  get<T>(token: BoundToken<T, any>): Promise<T>
  get<T>(token: FactoryToken<T, any>): Promise<T>

  async get(
    token:
      | ClassType
      | Token<any>
      | BoundToken<any, any>
      | FactoryToken<any, any>,
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

    await this.serviceInvalidator.invalidateWithStorage(holder.name, this.storage, {
      destroyContext: { container: this },
    })
  }

  /**
   * Disposes the container and cleans up all resources.
   */
  async dispose(): Promise<void> {
    await this.serviceInvalidator.clearAllWithStorage(this.storage, {
      destroyContext: { container: this },
    })
    await this.pluginRegistry.runContainerDispose(this)
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
